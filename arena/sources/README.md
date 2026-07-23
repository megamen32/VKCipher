# Russian dictionary sources

The production word transport is built from existing Russian lexical data. The
LLM arena is not allowed to invent words; it can only audit the resulting list.

## Inputs

- `frequencywords/ru_50k.txt` is the frequency-ordered Russian 50k list from
  [FrequencyWords](https://github.com/hermitdave/FrequencyWords/tree/master/content/2018/ru).
  The downloaded copy is distributed under the included `LICENSE` file.
- `hunspell/index.dic` and `hunspell/index.aff` are the Russian Hunspell
  dictionary from [wooorm/dictionaries](https://github.com/wooorm/dictionaries/tree/main/dictionaries/ru).
  Its license is included as `hunspell/LICENSE`.

The builder keeps words that occur in the frequency list and have a direct
entry in Hunspell. This removes generated compounds, model hallucinations and
most non-lexical tokens while preserving frequency order.

## Rebuild

```bash
node arena/build-word-dictionary.js
bash extension/build.sh
```

The exact exclusion policy is checked into
`extension/dictionaries/ru-common-8192-v4-denylist.txt`. It is intentionally
conservative because this list is used to make encrypted traffic look like
ordinary Russian text, not to make a guarantee about every external content
filter.
