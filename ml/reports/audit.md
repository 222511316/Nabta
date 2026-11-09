# Dataset audit

Source: IP102 v1.1 (Wu et al., IP102: A Large-Scale Benchmark Dataset for Insect Pest Recognition, CVPR 2019), obtained from https://huggingface.co/datasets/EnmmmmOvO/insect-pest-dataset. The official Google Drive link was over its download quota; split sizes match the official ones.

## Images per category

| Category | Train | Validation | Test | Shorter side < 100 px | Removed as duplicates |
| --- | ---: | ---: | ---: | ---: | ---: |
| Aphids | 4081 | 680 | 2046 | 13 | 250 |
| Whiteflies | 829 | 137 | 416 | 1 | 160 |
| Mealybugs | 243 | 40 | 123 | 3 | 36 |
| Scale insects | 1017 | 169 | 512 | 7 | 217 |
| Fruit flies | 595 | 100 | 300 | 3 | 77 |
| Armyworms and cutworms | 3992 | 664 | 2002 | 20 | 451 |
| Thrips | 1395 | 232 | 701 | 13 | 184 |
| Locusts and grasshoppers | 836 | 139 | 419 | 0 | 25 |

Training images per category range from 243 to 4081 (imbalance 16.8×), so training uses class-balanced weights.

## Near-duplicates across splits (R09)

2269 near-duplicate pairs cross splits (train→test: 1436, train→validation: 508, validation→test: 325). The later-split copy of each (1400 images) is excluded from evaluation and training; see `excluded.json`.

## Visual label check

Contact sheets of 8 random training images per IP102 class are in `audit/`. Notes from reviewing them are recorded below.

