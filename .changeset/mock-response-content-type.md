---
"@lokalise/universal-testing-utils": minor
---

Support explicit contentType selection in MockResponseParams for ApiContractMockttpHelper and ApiContractMswHelper. When a response entry declares multiple content types, passing contentType pins the mock to that single entry (skipping Accept negotiation) and only that entry's body field is required — making it possible to mock entries negotiation would never pick, such as a second JSON content type or a blob entry next to a JSON one.
