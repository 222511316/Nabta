"""BioCLIP without any training: each category is matched to text prompts instead. It's
reported next to the trained head to show what training on IP102 adds."""

import numpy as np

# Common names and the taxonomic group BioCLIP was trained to recognise.
PROMPTS = {
    "aphids": ["aphid", "Aphididae"],
    "whiteflies": ["whitefly", "Aleyrodidae"],
    "mealybugs": ["mealybug", "Pseudococcidae"],
    "scale_insects": ["scale insect", "Coccoidea"],
    "fruit_flies": ["fruit fly", "Tephritidae"],
    "armyworms_cutworms": ["armyworm caterpillar", "cutworm", "Noctuidae"],
    "thrips": ["thrips", "Thysanoptera"],
    "locusts": ["grasshopper", "locust", "Acrididae"],
}
TEMPLATE = "a photo of {}."


def text_embeddings(keys: list[str]) -> np.ndarray:
    """One unit-length text embedding per category: the mean of its prompts' embeddings."""
    import open_clip
    import torch

    model, _, _ = open_clip.create_model_and_transforms("hf-hub:imageomics/bioclip")
    tokenizer = open_clip.get_tokenizer("hf-hub:imageomics/bioclip")
    rows = []
    with torch.inference_mode():
        for key in keys:
            tokens = tokenizer([TEMPLATE.format(prompt) for prompt in PROMPTS[key]])
            embedded = model.encode_text(tokens).float()
            embedded = embedded / embedded.norm(dim=-1, keepdim=True)
            mean = embedded.mean(dim=0)
            rows.append((mean / mean.norm()).numpy())
    return np.stack(rows)


def predict(image_features: np.ndarray, text: np.ndarray) -> np.ndarray:
    """The category whose text is closest to each image (cosine similarity)."""
    images = image_features / np.linalg.norm(image_features, axis=1, keepdims=True)
    return (images @ text.T).argmax(axis=1)
