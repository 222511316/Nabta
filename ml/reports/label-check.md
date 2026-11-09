# Visual label check (charter R01)

Reviewed 2026-10-18 from the contact sheets in `audit/` (8 random training images per IP102 class).

## Mapping confirmed

In every category, the images match their IP102 class names, so the Hugging Face copy's 0-based labels line up with IP102's `classes.txt` (label = class id − 1). Examples: class 25 shows aphids, 72 greenhouse whiteflies, 83 citrus spiny whitefly pupae, 49 grasshoppers and locusts, 65 and 82 mealybugs.

## Noise found (not removed in Sprint 2)

| Kind | Where | Effect |
| --- | --- | --- |
| Drawings, diagrams, collages, text and watermarks | Every category, especially aphids (#53, #91), scale insects (#77), thrips (#34, #93), armyworms (#21, #24, #87) | Teaches the model features that growers' photos won't have |
| Damage with no insect visible | Fruit flies (cut fruit), thrips (#55 leaves), armyworms (#39, #40 chewed leaves), scale insects (#80, #81 spotted fruit) | Charter §5.2 puts identification from damage out of scope; these images blur that line |
| Several life stages in one category | Fruit flies (adults and maggots), armyworms and cutworms (caterpillars and moths) | Kept on purpose: a grower may photograph either stage |
| Unrelated subjects | Locusts (#49) cooked as food; scale insects (#77) photos of ladybirds, which prey on cottony cushion scale | Label noise |

## Follow-up for the team

Manually cleaning about 21,000 images wasn't possible this sprint. Suggested next step: the model's own low-confidence or misclassified training images give a short list to review first. Record any removals in a new `excluded-manual.json` so the evaluation stays reproducible (NFR15).
