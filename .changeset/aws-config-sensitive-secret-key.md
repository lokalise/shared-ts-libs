---
"@lokalise/aws-config": patch
---

Mark `AWS_SECRET_ACCESS_KEY` as sensitive in the envase schema, so its value is redacted from validation errors and flagged in generated env docs.
