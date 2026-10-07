# Implementation validation

These logs measure implementation commit `acafa2fd5a427f6e202fbff8bbc21a55f539ce9c` on
branch `feat/native-interactive-messages`. All recorded commands exited 0:
461 tests in 30 suites, 54 added feature tests, build, type/lint, formatting,
standalone example typechecking and the offline evidence verifier. Lint reported
the same 103 warnings measured at the baseline, with no errors.

[results.json](./results.json) records exact commands, exit codes and limitations.
The logs are separate from the unchanged [historical evidence](../baileys-native-interactive-evidence/README.md).
Its verifier retains the historical profile revision in its output; this run
loaded the library built from the implementation commit identified above.

No new live client check or e2e mock-server run occurred. Feature tests mock
transport and cryptographic boundaries and exercise generation, send fan-out,
own-device wrapping, failures and native response decode/event delivery offline.
N47's accepted iOS selection limitation remains explicit. No N47 callback is
claimed. Review, tag/release and upstream PR are pending.

These files are validation attachments added after the implementation checks;
they do not modify the source or historical fixtures measured by those checks.

Absolute checkout paths and the local hostname were normalized for public
attachments. Diagnostic content, counts, exit codes and timestamps are retained.
