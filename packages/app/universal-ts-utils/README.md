# universal-ts-utils 🧬

Isomorphic general-purpose TS utils

## Overview


### String array equality

This package also provides a function to compare string arrays:

```
import { areStringArraysEqual } from '@lokalise/universal-ts-utils'

const isoCodes = ['en', 'de', 'fr']
const otherIsoCodes = ['en', 'de', 'fr']

const result = areStringArraysEqual(isoCodes, otherIsoCodes)
```