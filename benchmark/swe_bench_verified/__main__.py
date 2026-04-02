import sys
from pathlib import Path

# Allow direct script execution from benchmark/swe_bench_verified/__main__.py
# while keeping sibling imports simple.
sys.path.insert(0, str(Path(__file__).parent))

from cli import main  # noqa: E402

main()
