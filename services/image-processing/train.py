from pathlib import Path

from ultralytics import YOLO


ROOT = Path(__file__).resolve().parent
DATASET = ROOT / "datasets" / "book-spines" / "dataset.yaml"
OUTPUT_MODEL = ROOT / "models" / "book-spine-detector.pt"


def main() -> None:
    if not DATASET.exists():
        raise SystemExit(f"Dataset config not found: {DATASET}")

    model = YOLO("yolov8n.pt")
    results = model.train(
        data=str(DATASET),
        epochs=75,
        imgsz=960,
        project=str(ROOT / "runs"),
        name="book-spine-detector",
        exist_ok=True,
    )

    best_weights = Path(results.save_dir) / "weights" / "best.pt"
    OUTPUT_MODEL.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_MODEL.write_bytes(best_weights.read_bytes())
    print(f"Saved detector weights to {OUTPUT_MODEL}")


if __name__ == "__main__":
    main()

