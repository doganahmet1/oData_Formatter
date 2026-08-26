# oData_Formatter

Fiori OData V2 projelerinde post öncesi payload alanlarını ilgili entity set tiplerine otomatik dönüştürür.

## Kullanım

```js
const { formatPayloadForEntitySet } = require("./odataFormatter");

const payload = {
  ProductId: "1001",
  IsActive: "true",
  Price: 25.4,
  CreatedAt: "2026-08-26T09:00:00Z"
};

const formattedPayload = formatPayloadForEntitySet(oModel, "Products", payload);
// ProductId -> number/string dönüşümü entity metadata tipine göre yapılır
// IsActive -> boolean
// CreatedAt -> Date
```

`formatPayloadForEntitySet(modelOrMetadata, entitySetName, payload)`:
- `modelOrMetadata`: sap.ui.model.odata.v2.ODataModel veya doğrudan `getServiceMetadata()` çıktısı
- `entitySetName`: `Products` veya `/Products`
- `payload`: post edilecek obje

Metadata’da tanımlı alan tipleri için otomatik dönüşüm uygular; tanımlı olmayan alanları olduğu gibi bırakır.
