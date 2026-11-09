"""Frozen pretrained image models that turn a photo into a feature vector.

Preprocessing is spelled out (not borrowed from a library) so the backend can repeat it
exactly, and it is recorded in the exported model card.
"""

from dataclasses import dataclass

import torch
from torchvision import transforms

CLIP_MEAN = (0.48145466, 0.4578275, 0.40821073)
CLIP_STD = (0.26862954, 0.26130258, 0.27577711)
IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)


@dataclass(frozen=True)
class Preprocess:
    resize: int  # shorter side resized to this
    crop: int  # then centre-cropped to crop × crop
    interpolation: str  # "bicubic" or "bilinear"
    mean: tuple[float, float, float]
    std: tuple[float, float, float]

    def _mode(self):
        return getattr(transforms.InterpolationMode, self.interpolation.upper())

    def eval_transform(self):
        return transforms.Compose(
            [
                transforms.Resize(self.resize, interpolation=self._mode()),
                transforms.CenterCrop(self.crop),
                transforms.ToTensor(),
                transforms.Normalize(self.mean, self.std),
            ]
        )

    def augment_transform(self):
        """A second, varied view of each training photo: framing, mirroring and lighting change,
        as they do between growers' phone photos (charter R02)."""
        return transforms.Compose(
            [
                transforms.RandomResizedCrop(self.crop, scale=(0.5, 1.0), interpolation=self._mode()),
                transforms.RandomHorizontalFlip(),
                transforms.ColorJitter(brightness=0.3, contrast=0.3, saturation=0.2),
                transforms.ToTensor(),
                transforms.Normalize(self.mean, self.std),
            ]
        )


@dataclass
class Backbone:
    name: str
    description: str
    preprocess: Preprocess
    encoder: torch.nn.Module  # image tensor batch → feature batch
    feature_dim: int


class _BioClipImageEncoder(torch.nn.Module):
    def __init__(self, clip_model):
        super().__init__()
        self.visual = clip_model.visual

    def forward(self, images):
        return self.visual(images)


def load_backbone(name: str) -> Backbone:
    if name == "resnet50":
        from torchvision.models import ResNet50_Weights, resnet50

        model = resnet50(weights=ResNet50_Weights.IMAGENET1K_V2)
        model.fc = torch.nn.Identity()
        return Backbone(
            name="resnet50",
            description="ResNet-50, ImageNet-1k weights (torchvision IMAGENET1K_V2)",
            preprocess=Preprocess(232, 224, "bilinear", IMAGENET_MEAN, IMAGENET_STD),
            encoder=model.eval(),
            feature_dim=2048,
        )
    if name == "bioclip":
        import open_clip

        model, _, _ = open_clip.create_model_and_transforms("hf-hub:imageomics/bioclip")
        return Backbone(
            name="bioclip",
            description="BioCLIP ViT-B/16 image encoder (imageomics/bioclip, MIT licence)",
            preprocess=Preprocess(224, 224, "bicubic", CLIP_MEAN, CLIP_STD),
            encoder=_BioClipImageEncoder(model).eval(),
            feature_dim=512,
        )
    raise ValueError(f"Unknown backbone {name!r}")
