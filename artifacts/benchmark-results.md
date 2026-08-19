# target-disambiguation benchmark

| Metric | Value |
| --- | ---: |
| Fixtures | 30 |
| Text-only success rate | 50.00% |
| Web Picker locator success rate | 80.00% |
| Mean payload bytes | 1062.2333333333333 |
| P95 payload bytes | 1162 |

## Confidence calibration

| Confidence | Fixtures | Locator successes |
| --- | ---: | ---: |
| high | 15 | 15 |
| low | 6 | 0 |
| medium | 9 | 9 |

## Strata

| Label stratum | Fixtures | Text-only success rate | Locator success rate |
| --- | ---: | ---: | ---: |
| ambiguous-label | 15 | 0.00% | 86.67% |
| unique-label | 15 | 100.00% | 73.33% |

## Category confidence calibration

| Category | Confidence | Fixtures | Locator successes |
| --- | --- | ---: | ---: |
| aria-only | high | 5 | 5 |
| aria-only | medium | 0 | 0 |
| aria-only | low | 0 | 0 |
| generated-class | high | 0 | 0 |
| generated-class | medium | 4 | 4 |
| generated-class | low | 1 | 0 |
| nested-landmark | high | 0 | 0 |
| nested-landmark | medium | 4 | 4 |
| nested-landmark | low | 1 | 0 |
| repeated-class | high | 3 | 3 |
| repeated-class | medium | 0 | 0 |
| repeated-class | low | 2 | 0 |
| repeated-label | high | 3 | 3 |
| repeated-label | medium | 1 | 1 |
| repeated-label | low | 1 | 0 |
| safe-test-id | high | 4 | 4 |
| safe-test-id | medium | 0 | 0 |
| safe-test-id | low | 1 | 0 |

## Categories

| Category | Fixtures | Text-only successes | Locator successes |
| --- | ---: | ---: | ---: |
| aria-only | 5 | 2 | 5 |
| generated-class | 5 | 3 | 4 |
| nested-landmark | 5 | 2 | 4 |
| repeated-class | 5 | 3 | 3 |
| repeated-label | 5 | 2 | 4 |
| safe-test-id | 5 | 3 | 4 |

## Fixtures

| Fixture | Category | Label stratum | Text-only success | Locator success | Confidence | Payload bytes |
| --- | --- | --- | --- | --- | --- | ---: |
| aria-only-01 | aria-only | ambiguous-label | false | true | high | 1134 |
| aria-only-02 | aria-only | unique-label | true | true | high | 1139 |
| aria-only-03 | aria-only | ambiguous-label | false | true | high | 1150 |
| aria-only-04 | aria-only | unique-label | true | true | high | 1212 |
| aria-only-05 | aria-only | ambiguous-label | false | true | high | 1062 |
| generated-class-01 | generated-class | ambiguous-label | false | true | medium | 1051 |
| generated-class-02 | generated-class | unique-label | true | true | medium | 1006 |
| generated-class-03 | generated-class | ambiguous-label | false | true | medium | 993 |
| generated-class-04 | generated-class | unique-label | true | true | medium | 964 |
| generated-class-05 | generated-class | unique-label | true | false | low | 987 |
| nested-landmark-01 | nested-landmark | ambiguous-label | false | true | medium | 1120 |
| nested-landmark-02 | nested-landmark | unique-label | true | true | medium | 1162 |
| nested-landmark-03 | nested-landmark | ambiguous-label | false | true | medium | 1136 |
| nested-landmark-04 | nested-landmark | unique-label | true | false | low | 1115 |
| nested-landmark-05 | nested-landmark | ambiguous-label | false | true | medium | 1072 |
| repeated-class-01 | repeated-class | ambiguous-label | false | true | high | 1079 |
| repeated-class-02 | repeated-class | unique-label | true | true | high | 1095 |
| repeated-class-03 | repeated-class | ambiguous-label | false | false | low | 1008 |
| repeated-class-04 | repeated-class | unique-label | true | true | high | 1118 |
| repeated-class-05 | repeated-class | unique-label | true | false | low | 1037 |
| repeated-label-01 | repeated-label | ambiguous-label | false | true | high | 993 |
| repeated-label-02 | repeated-label | unique-label | true | true | high | 1023 |
| repeated-label-03 | repeated-label | ambiguous-label | false | false | low | 956 |
| repeated-label-04 | repeated-label | unique-label | true | true | medium | 961 |
| repeated-label-05 | repeated-label | ambiguous-label | false | true | high | 999 |
| safe-test-id-01 | safe-test-id | ambiguous-label | false | true | high | 1050 |
| safe-test-id-02 | safe-test-id | unique-label | true | true | high | 1091 |
| safe-test-id-03 | safe-test-id | ambiguous-label | false | true | high | 1041 |
| safe-test-id-04 | safe-test-id | unique-label | true | true | high | 1034 |
| safe-test-id-05 | safe-test-id | unique-label | true | false | low | 1079 |
