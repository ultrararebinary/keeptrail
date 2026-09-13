# Whisper benchmark

Review note (2026-09-13): the historical input below was generated silence, not representative speech. These figures measure only the Whisper process, not aggregate backend memory. The review host is Apple M1 with 8 GiB RAM; target hardware is available, but the required workload/WER evaluation and automatic selection logic remain unverified. These measurements were not rerun during review.

Generated 2026-09-12T18:34:04.607Z. Input: keeptrail-benchmark-60s.wav; duration: 60.00 seconds.

- ggml-small.bin: median RTF 0.143, peak whisper RSS 836.5 MiB, SHA-256 1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b.
- ggml-base.bin: median RTF 0.050, peak whisper RSS 363.2 MiB, SHA-256 60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe.

WER was not measured because the required consented French and English reference fixtures are not present. BENCHMARK_TARGET_NOT_MET: WER <=20% on both committed French and English fixtures is required before selecting a model.
