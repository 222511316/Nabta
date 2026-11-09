"""Step 0: download IP102 v1.1 from its Hugging Face mirror, pinned to one revision.

    python -m nabta_ml.download

About 3.2 GB of parquet files into NABTA_DATA_DIR/ip102-hf. Files already there with the
right size are kept, so an interrupted download can simply be run again.
"""

import shutil
import sys

from huggingface_hub import HfApi, hf_hub_download

from nabta_ml import config


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    repo, revision = config.DATASET_SOURCE["repository"], config.DATASET_SOURCE["revision"]
    config.RAW_DIR.mkdir(parents=True, exist_ok=True)
    info = HfApi().dataset_info(repo, revision=revision, files_metadata=True)
    for file in info.siblings:
        if not file.rfilename.endswith(".parquet"):
            continue
        target = config.RAW_DIR / file.rfilename.rsplit("/", 1)[-1]
        if target.is_file() and target.stat().st_size == file.size:
            print(f"{target.name}: already downloaded")
            continue
        print(f"{target.name}: downloading {file.size / 1e6:.0f} MB…", flush=True)
        staged = hf_hub_download(
            repo, file.rfilename, repo_type="dataset", revision=revision, local_dir=config.DATA_DIR / "hf-download"
        )
        shutil.move(staged, target)
    print(f"IP102 is in {config.RAW_DIR}. Next: python -m nabta_ml.prepare")


if __name__ == "__main__":
    main()
