import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const libraryPath = process.argv[2];
assert.ok(libraryPath, "Pass the path to the built Baileys lib/index.js");
const { proto, encodeBinaryNode, decodeBinaryNode } = await import(pathToFileURL(libraryPath).href);
const conversionOptions = { bytes: String, longs: Number, enums: String };

async function readEvidence(fileName)
{
  return JSON.parse(await readFile(new URL(fileName, import.meta.url), "utf8"));
}

function normalize(value)
{
  return JSON.parse(JSON.stringify(value));
}

function verifyMessage(message)
{
  const original = proto.Message.fromObject(message);
  const bytes = proto.Message.encode(original).finish();
  const decoded = proto.Message.toObject(proto.Message.decode(bytes), conversionOptions);
  assert.deepEqual(decoded, message, "Protobuf round-trip changed a fixture");
  return bytes.length;
}

const selected = await readEvidence("selected-profiles.json");
const exploratory = await readEvidence("exploratory-profiles.json");
const transport = await readEvidence("transport-results.json");
const responses = await readEvidence("native-response-fixtures.json");
const preflights = await readEvidence("offline-preflights.json");
const generationProbes = await readEvidence("high-level-generation-probes.json");
assert.equal(selected.fixtures.length, 5);
assert.equal(exploratory.fixtures.length, 58);
assert.equal(transport.results.length, 115);
assert.equal(transport.events.length, 366);
assert.equal(responses.fixtures.length, 12);
assert.equal(preflights.measurements.length, 58);
assert.equal(generationProbes.results.length, 6);
assert.equal(generationProbes.liveTransmission, false);
assert.ok(
  generationProbes.results.every((item) =>
    item.generation === "rejected" && item.failure.disconnectCode === 400
  ),
);

const profileMeasurements = [];
let binaryNodeRoundTrips = 0;
for (const fixture of [...selected.fixtures, ...exploratory.fixtures])
{
  const protobufBytes = verifyMessage(fixture.message);
  for (const relayNode of fixture.relayNodes)
  {
    const decoded = await decodeBinaryNode(encodeBinaryNode(relayNode));
    assert.deepEqual(normalize(decoded), relayNode, `Binary-node round-trip changed ${fixture.sampleId}`);
    binaryNodeRoundTrips++;
  }
  profileMeasurements.push({ sampleId: fixture.sampleId, key: fixture.key, protobufBytes });
}

const profilesBySample = new Map(selected.fixtures.map((item) => [item.sampleId, item]));
assert.deepEqual([...profilesBySample.keys()].sort(), ["N03", "N04", "N23", "N25", "N47"]);
for (const sampleId of ["N23", "N25"])
{
  const fixture = profilesBySample.get(sampleId);
  const message = fixture.message;
  const buttons = message.documentWithCaptionMessage.message.buttonsMessage;
  assert.equal(buttons.headerType, sampleId === "N23" ? "EMPTY" : "IMAGE");
  assert.equal(buttons.buttons.length, 2);
  assert.ok(buttons.buttons.every((button) => button.type === "RESPONSE" && button.buttonId));
  assert.equal(Buffer.from(message.messageContextInfo.messageSecret, "base64").length, 32);
  assert.equal(
    Buffer.from(message.messageContextInfo.deviceListMetadata.recipientKeyHash, "base64").length,
    10,
  );
  assert.equal(message.messageContextInfo.deviceListMetadataVersion, 2);
  assert.equal(fixture.relayNodes[0].attrs.actual_actors, "2");
  assert.ok(fixture.relayNodes[0].content.some((node) => node.tag === "quality_control"));
}

for (const sampleId of ["N03", "N04", "N47"])
{
  const fixture = profilesBySample.get(sampleId);
  assert.ok(
    !Object.hasOwn(fixture.message, "messageContextInfo"),
    `${sampleId} must omit root message context`,
  );
  assert.equal(fixture.relayNodes.length, 1);
  assert.equal(fixture.relayNodes[0].tag, "biz");
  assert.deepEqual(fixture.relayNodes[0].attrs, {});
}

const urlFlow = profilesBySample.get("N03").message.interactiveMessage.nativeFlowMessage;
assert.equal(urlFlow.buttons[0].name, "cta_url");
assert.ok(!Object.hasOwn(urlFlow, "messageVersion"));
const urlParameters = JSON.parse(urlFlow.buttons[0].buttonParamsJson);
assert.equal(urlParameters.url, urlParameters.merchant_url);
assert.equal(JSON.parse(urlFlow.messageParamsJson).from, "api");

const listProfile = profilesBySample.get("N04");
assert.equal(listProfile.message.listMessage.listType, "SINGLE_SELECT");
assert.deepEqual(listProfile.relayNodes[0].content[0].attrs, { type: "product_list", v: "2" });

const carousel = profilesBySample.get("N47").message.interactiveMessage;
assert.equal(carousel.header.hasMediaAttachment, false);
for (const omittedField of ["footer", "contextInfo", "nativeFlowMessage"])
{
  assert.ok(!Object.hasOwn(carousel, omittedField));
}
assert.deepEqual(Object.keys(carousel.carouselMessage), ["cards"]);
assert.equal(carousel.carouselMessage.cards.length, 2);
for (const card of carousel.carouselMessage.cards)
{
  assert.equal(card.header.hasMediaAttachment, true);
  assert.equal(card.header.imageMessage.mimetype, "image/jpeg");
  assert.equal(card.footer.text, "");
  assert.equal(card.nativeFlowMessage.messageParamsJson, "{}");
  assert.ok(!Object.hasOwn(card.nativeFlowMessage, "messageVersion"));
  assert.equal(card.nativeFlowMessage.buttons[0].name, "quick_reply");
  assert.ok(JSON.parse(card.nativeFlowMessage.buttons[0].buttonParamsJson).id);
}

const transmittedSamples = new Set(transport.results.map((item) => item.id));
const structuralSamples = new Set(exploratory.fixtures.map((item) => item.sampleId));
for (let sampleNumber = 1; sampleNumber <= 51; sampleNumber++)
{
  const sampleId = `N${String(sampleNumber).padStart(2, "0")}`;
  assert.ok(transmittedSamples.has(sampleId), `Missing transport record for ${sampleId}`);
  assert.ok(structuralSamples.has(sampleId), `Missing structural fixture for ${sampleId}`);
}

const submittedByMessage = new Map(
  transport.results.filter((item) => item.messageId).map((item) => [item.messageId, item]),
);
const replyIdentifiers = new Set();
const responseMeasurements = [];
for (const fixture of responses.fixtures)
{
  assert.ok(!replyIdentifiers.has(fixture.replyMessageId), "Duplicate reply fixture");
  replyIdentifiers.add(fixture.replyMessageId);
  assert.equal(fixture.response.contextInfo.stanzaId, fixture.targetMessageId);
  const selectedIdentifier = fixture.response.selectedButtonId ?? fixture.response.selectedId
    ?? fixture.response.singleSelectReply?.selectedRowId;
  assert.equal(selectedIdentifier, fixture.selectedIdentifier);
  const target = submittedByMessage.get(fixture.targetMessageId);
  assert.ok(target, "Reply target is absent from transport evidence");
  assert.ok(
    fixture.selectedIdentifier.startsWith(`sample_${target.id}_`),
    "Reply option belongs to a different test target",
  );
  const protobufBytes = verifyMessage({ [fixture.wireType]: fixture.response });
  responseMeasurements.push({
    replyMessageId: fixture.replyMessageId,
    targetSampleId: target.id,
    wireType: fixture.wireType,
    protobufBytes,
  });
}
assert.ok(
  responseMeasurements.every((item) => item.targetSampleId !== "N47"),
  "Do not attribute another carousel callback to N47",
);

process.stdout.write(
  JSON.stringify(
    {
      verificationKind:
        "Offline evidence integrity; no authentication, network, uploads or live transmission",
      libraryRevision: selected.libraryRevision,
      libraryEntryPointSha256: createHash("sha256").update(await readFile(libraryPath)).digest("hex"),
      verifiedAtUtc: new Date().toISOString(),
      nodeVersion: process.version,
      profileRoundTrips: profileMeasurements.length,
      binaryNodeRoundTrips,
      responseRoundTrips: responseMeasurements.length,
      selectedProfileAssertions: "passed",
      allN01ThroughN51Present: true,
      exactResponseTargetAssertions: "passed",
      transportRecords: transport.results.length,
      transportEvents: transport.events.length,
      historicalPreflights: preflights.measurements.length,
      historicalGenerationRejections: generationProbes.results.length,
      profileMeasurements,
      responseMeasurements,
    },
    null,
    2,
  ) + "\n",
);
