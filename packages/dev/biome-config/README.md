# @lokalise/biome-config
Lokalise config for Biome

## Getting started

You can use the following biome.json configurations: 

Backend:

```json
{
	"$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
	"extends": ["./node_modules/@lokalise/biome-config/configs/biome-base.jsonc", "./node_modules/@lokalise/biome-config/configs/biome-esm.jsonc"]
}
```

Packages:
    
```json
{
    "$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
    "extends": ["./node_modules/@lokalise/biome-config/configs/biome-base.jsonc", "./node_modules/@lokalise/biome-config/configs/biome-package.jsonc"]
}
```

Frontend:

```json
{
	"$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
	"extends": ["./node_modules/@lokalise/biome-config/configs/biome-base.jsonc", "./node_modules/@lokalise/biome-config/configs/biome-frontend.jsonc"]
}
```
