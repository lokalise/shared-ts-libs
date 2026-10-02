# Supported Languages

## Project Purpose

This package provides a list of language codes that are supported by CLDR43, and a subset of them supported by Lokalise.

A small list of languages that are not part of CLDR43 is also supported, because existing data uses them (see `src/constants/non-cldr-languages.ts`). CLDR has no display names or plural rules for them: English names come from that list, other languages show the language code with the localised script and region, and plural rules fall back to English. They are not part of the languages supported by Lokalise.

## Getting Started

Install all dependencies:

```shell
npm install
```

Run all tests:

```shell
npm run test
```
