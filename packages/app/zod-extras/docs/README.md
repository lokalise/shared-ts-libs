# docs

Information of how to use `zod-extras` package.

## Preprocessors

The zod framework supports [preprocessors](https://github.com/colinhacks/zod#preprocess) which are functions that can modify input data before it's send to validation.

### Type coercion

A common usecase for preprocessors is type coercion - this package includes a few helpers for that, you can find documentation for those [here](/docs/type-coercion.md).

### String split

Another common usecase is turning a string like `"Alice,Bob,Charlie"` into `['Alice', 'Bob', 'Charlie']`, this can be done using the `stringSplitFactory` function which returns a function that can be used as a preprocessor.

**Arguments**
| Name | Description | Type | Default |
|--------------|---------------------------------------------------------------|---------|---------|
| delimiter | The pattern used as delimiter | string | `,` |
| trim | If `true` values will be trimmed after splitting | boolean | `false` |

```typescript
import { z } from 'zod'
import stringSplitFactory from 'src/stringSplitFactory'

const preprocessor = stringSplitFactory({ delimiter: '|' })
const schema = z.preprocess(preprocessor, z.array(z.string()))
const result = schema.parse('Alice|Bob|Charlie')

expect(result).toEqual(['Alice', 'Bob', 'Charlie'])
```

### Number split

The `numberSplitFactory` works similar to `stringSplitFactory` except it will also cast values to numbers after splitting.

**Arguments**
| Name | Description | Type | Default |
|--------------|---------------------------------------------------------------|---------|---------|
| delimiter | The pattern used as delimiter | string | `,` |

```typescript
import { z } from 'zod'
import numberSplitFactory from 'src/numberSplitFactory'

const preprocessor = numberSplitFactory({ delimiter: '|' })
const schema = z.preprocess(preprocessor, z.array(z.number()))
const result = schema.parse('1|2|3')

expect(result).toEqual([1, 2, 3])
```
