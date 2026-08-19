# target-disambiguation benchmark

| Metric | Value |
| --- | ---: |
| Fixtures | 30 |
| Text-only success rate | 0.00% |
| Web Picker locator success rate | 100.00% |
| Mean payload bytes | 1065 |
| P95 payload bytes | 1138 |

## Confidence calibration

| Confidence | Fixtures | Locator successes |
| --- | ---: | ---: |
| high | 20 | 20 |
| low | 0 | 0 |
| medium | 10 | 10 |

## Categories

| Category | Fixtures | Text-only successes | Locator successes |
| --- | ---: | ---: | ---: |
| aria-only | 5 | 0 | 5 |
| generated-class | 5 | 0 | 5 |
| nested-landmark | 5 | 0 | 5 |
| repeated-class | 5 | 0 | 5 |
| repeated-label | 5 | 0 | 5 |
| safe-test-id | 5 | 0 | 5 |

## Fixtures

| Fixture | Category | Text-only success | Locator success | Confidence | Payload bytes |
| --- | --- | --- | --- | --- | ---: |
| aria-only-01 | aria-only | false | true | high | 1134 |
| aria-only-02 | aria-only | false | true | high | 1134 |
| aria-only-03 | aria-only | false | true | high | 1138 |
| aria-only-04 | aria-only | false | true | high | 1158 |
| aria-only-05 | aria-only | false | true | high | 1134 |
| generated-class-01 | generated-class | false | true | medium | 984 |
| generated-class-02 | generated-class | false | true | medium | 989 |
| generated-class-03 | generated-class | false | true | medium | 989 |
| generated-class-04 | generated-class | false | true | medium | 1009 |
| generated-class-05 | generated-class | false | true | medium | 984 |
| nested-landmark-01 | nested-landmark | false | true | medium | 1120 |
| nested-landmark-02 | nested-landmark | false | true | medium | 1120 |
| nested-landmark-03 | nested-landmark | false | true | medium | 1120 |
| nested-landmark-04 | nested-landmark | false | true | medium | 1120 |
| nested-landmark-05 | nested-landmark | false | true | medium | 1120 |
| repeated-class-01 | repeated-class | false | true | high | 1100 |
| repeated-class-02 | repeated-class | false | true | high | 1080 |
| repeated-class-03 | repeated-class | false | true | high | 1100 |
| repeated-class-04 | repeated-class | false | true | high | 1088 |
| repeated-class-05 | repeated-class | false | true | high | 1070 |
| repeated-label-01 | repeated-label | false | true | high | 993 |
| repeated-label-02 | repeated-label | false | true | high | 999 |
| repeated-label-03 | repeated-label | false | true | high | 993 |
| repeated-label-04 | repeated-label | false | true | high | 999 |
| repeated-label-05 | repeated-label | false | true | high | 1029 |
| safe-test-id-01 | safe-test-id | false | true | high | 1050 |
| safe-test-id-02 | safe-test-id | false | true | high | 1050 |
| safe-test-id-03 | safe-test-id | false | true | high | 1049 |
| safe-test-id-04 | safe-test-id | false | true | high | 1048 |
| safe-test-id-05 | safe-test-id | false | true | high | 1049 |
