from PIL import Image, ImageDraw, ImageEnhance

from nabta_ml.dedupe import cross_split_duplicates, dhash, hamming


def pattern(seed: int, size=(320, 240)) -> Image.Image:
    """A distinct test picture: stripes and a disc whose layout depends on seed."""
    image = Image.new("RGB", size, (40 + seed * 20 % 200, 120, 60))
    draw = ImageDraw.Draw(image)
    for i in range(0, size[0], 20 + seed * 7 % 30):
        draw.rectangle((i, 0, i + 8, size[1]), fill=(200, 180 - seed * 13 % 150, 90))
    draw.ellipse((40 + seed * 11 % 150, 30, 140 + seed * 11 % 150, 130), fill=(20, 20, 20))
    return image


def test_the_same_picture_hashes_identically():
    assert dhash(pattern(1)) == dhash(pattern(1))


def test_a_resized_and_brightened_copy_is_still_a_near_duplicate():
    original = pattern(2)
    copy = ImageEnhance.Brightness(original.resize((160, 120))).enhance(1.15)

    assert hamming(dhash(original), dhash(copy)) <= 4


def test_different_pictures_are_far_apart():
    assert hamming(dhash(pattern(3)), dhash(pattern(9))) > 10


def test_only_duplicates_that_cross_splits_are_reported():
    hashes = {
        ("train", 1): dhash(pattern(1)),
        ("test", 7): dhash(pattern(1).resize((200, 150))),  # leaked into test
        ("train", 2): dhash(pattern(4)),
        ("train", 3): dhash(pattern(4)),  # duplicate within train: not a leak
        ("validation", 5): dhash(pattern(6)),
    }

    pairs = cross_split_duplicates(hashes, max_distance=4)

    assert pairs == [(("train", 1), ("test", 7))]


def test_hashes_with_the_top_bit_set_are_compared_too():
    # Half of all 64-bit hashes have the top bit set; they must not overflow.
    top = 0xFFFF_FFFF_FFFF_FFF0
    hashes = {("train", 1): top, ("test", 2): top | 0b11, ("test", 3): 0x0F0F_0F0F_0F0F_0F0F}

    assert cross_split_duplicates(hashes, max_distance=4) == [(("train", 1), ("test", 2))]
