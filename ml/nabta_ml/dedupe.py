"""Near-duplicate detection, so the same photo can't sit in both training and test data (R09)."""

from collections import defaultdict

import numpy as np
from PIL import Image

SPLIT_ORDER = {"train": 0, "validation": 1, "test": 2}


def dhash(image: Image.Image, size: int = 8) -> int:
    """64-bit difference hash: robust to resizing, recompression and small brightness changes."""
    gray = image.convert("L").resize((size + 1, size), Image.Resampling.LANCZOS)
    pixels = np.asarray(gray, dtype=np.int16)
    bits = (pixels[:, 1:] > pixels[:, :-1]).flatten()
    return int("".join("1" if bit else "0" for bit in bits), 2)


def hamming(a: int, b: int) -> int:
    return (a ^ b).bit_count()


def _bands(value: int, count: int, width: int = 64) -> list[tuple[int, int]]:
    """Splits a hash into `count` bit bands, tagged with their position."""
    # Plain Python ints: NumPy integers would overflow on hashes with the top bit set.
    edges = [round(i * width / count) for i in range(count + 1)]
    return [(i, (value >> edges[i]) & ((1 << (edges[i + 1] - edges[i])) - 1)) for i in range(count)]


def cross_split_duplicates(hashes: dict[tuple[str, int], int], max_distance: int = 4) -> list[tuple]:
    """Pairs of images in different splits whose hashes differ by at most `max_distance` bits.

    With max_distance + 1 bands, any two hashes that close share at least one identical band
    (pigeonhole), so only images sharing a band are compared.
    """
    buckets = defaultdict(list)
    for key, value in hashes.items():
        for band in _bands(value, max_distance + 1):
            buckets[band].append(key)

    found = set()
    for keys in buckets.values():
        for i, a in enumerate(keys):
            for b in keys[i + 1 :]:
                if a[0] == b[0]:
                    continue  # same split: not a leak
                if hamming(hashes[a], hashes[b]) <= max_distance:
                    found.add(tuple(sorted((a, b), key=lambda k: (SPLIT_ORDER[k[0]], k[1]))))
    return sorted(found, key=lambda pair: (SPLIT_ORDER[pair[0][0]], pair[0][1], pair[1][1]))
