"""Train NetShield's Random Forest from a real labelled flow CSV dataset."""
import argparse

try:
    from .ml_detector import MLDetector, MODEL_FILE
except ImportError:
    from ml_detector import MLDetector, MODEL_FILE


def main():
    parser = argparse.ArgumentParser(description="Train NetShield from real flow CSV data")
    parser.add_argument("dataset", help="CSV file or directory containing CIC-IDS-style CSV files")
    parser.add_argument("--model", default=None, help="Output .pkl path")
    args = parser.parse_args()
    detector = MLDetector(
        model_path=args.model or MODEL_FILE,
        dataset_path=args.dataset,
    )
    detector.train_and_save(args.dataset)
    print(detector.get_info())


if __name__ == "__main__":
    main()
