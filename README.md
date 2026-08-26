# OData Entity Validator (`_getValidationItems`)

SAP Fiori / UI5 (OData V2) projelerinde **POST/PUT** işlemlerinden önce, göndereceğiniz veri objesini elle tek tek kontrol etmek yerine, ilgili **entity set**'in metadata bilgisine göre otomatik olarak doğrulayan ve mümkünse doğru tipe dönüştüren yardımcı bir metod.

## Neden

Manuel oData objesi oluştururken sık karşılaşılan sorunlar:

- `undefined` / `null` değerlerin backend'e hatalı gitmesi
- `Edm.Decimal` alanlarının `number` yerine `string` olması gerektiğinin unutulması
- `Edm.Int32` alanına string gönderilmesi
- Tarih alanlarının `Date` objesine çevrilmeden gönderilmesi
- Her entity için ayrı ayrı elle yazılan tip kontrol kodları

Bu metod, **OData metadata'sını** okuyup bu kontrolleri otomatikleştirir.

## Özellikler

- ✅ Sadece **objede gönderilen** alanları kontrol eder (partial update / key alanları için sorun çıkarmaz)
- ✅ `nullable=false` olan zorunlu alanları kontrol eder
- ✅ Yanlış tip geldiğinde **mümkünse otomatik dönüştürür** ve bunu `info` seviyesinde loglar
- ✅ Dönüştürülemiyorsa açıklayıcı bir **hata mesajı** üretir
- ✅ `Edm.String` için `maxLength`, `Edm.Decimal` için `scale` (ondalık basamak) kontrolü yapar
- ✅ Metadata henüz yüklenmemişse (ilk çağrıda) otomatik bekler, `undefined` hatası vermez

## Desteklenen EDM Tipleri

| EDM Tipi | Beklenen JS Tipi | Otomatik Dönüşüm |
|---|---|---|
| `Edm.String`, `Edm.Guid` | `string` | `String(value)` |
| `Edm.Int16/32/64`, `Edm.Byte`, `Edm.SByte` | `number` (integer) | `parseInt(value, 10)` |
| `Edm.Decimal` | `string` (sayısal) | `number` ise `String(value)` |
| `Edm.Double`, `Edm.Single` | `number` | `Number(value)` |
| `Edm.Boolean` | `boolean` | `"true"/"1"` → `true`, `"false"/"0"` → `false` |
| `Edm.DateTime`, `Edm.DateTimeOffset` | `Date` | `new Date(value)` |

## Kurulum

Metodu ilgili controller/base controller içine ekleyin:

```javascript
/**
 * OData metadata'sından entity type bilgisini okuyup, gönderilecek data
 * objesindeki (sadece objede mevcut olan) her alanı tip/nullable
 * kontrolünden geçirir. Uygunsa değeri doğru tipe dönüştürüp oData'yı
 * in-place günceller ve bunu info olarak loglar; dönüştürülemiyorsa
 * hata mesajı üretir.
 *
 * @param {object} oData - Gönderilecek data (POST/PUT body'si)
 * @param {string} sEntitySet - Entity set adı (örn: "OfferSet")
 * @returns {Promise<string>} Hata mesajlarının "\n" ile birleştirilmiş hali (hata yoksa boş string)
 */
async _getValidationItems(oData, sEntitySet) {
  const errors = [];
  const oModel = this.getModel(); // OData V2 model
  const oMetaModel = oModel.getMetaModel();

  // Metadata henüz yüklenmediyse burada bekle (ilk çağrıda undefined dönmesini engeller)
  await oMetaModel.loaded();

  const oEntitySet = oMetaModel.getODataEntitySet(sEntitySet);
  const oEntityType = oEntitySet ? oMetaModel.getODataEntityType(oEntitySet.entityType) : null;

  if (!oEntityType) {
    errors.push(`Entity type bulunamadı: ${sEntitySet}`);
    return errors.join("\n");
  }

  const logConversion = (sName, sEdmType, vOld, vNew) => {
    const sMsg =
      `[${sEntitySet}] "${sName}" alanı otomatik dönüştürüldü ` +
      `(${sEdmType}): eski değer = ${JSON.stringify(vOld)} (${typeof vOld}) ` +
      `-> yeni değer = ${JSON.stringify(vNew)} (${typeof vNew})`;
    if (sap.base && sap.base.Log) {
      sap.base.Log.info(sMsg);
    } else {
      console.info(sMsg);
    }
  };

  oEntityType.property.forEach((oProp) => {
    const sName = oProp.name;
    const sEdmType = oProp.type;
    const bNullable = oProp.nullable !== "false";

    if (!(sName in oData)) {
      return;
    }

    let vValue = oData[sName];
    const isEmpty = vValue === null || vValue === "";
    if (!bNullable && isEmpty) {
      errors.push(`${sName} alanı zorunludur (null/boş olamaz).`);
      return;
    }
    if (isEmpty) {
      return;
    }

    switch (sEdmType) {
      case "Edm.String":
      case "Edm.Guid": {
        if (typeof vValue !== "string") {
          const vConverted = String(vValue);
          logConversion(sName, sEdmType, vValue, vConverted);
          oData[sName] = vConverted;
        }
        break;
      }
      case "Edm.Int16":
      case "Edm.Int32":
      case "Edm.Int64":
      case "Edm.Byte":
      case "Edm.SByte": {
        if (typeof vValue !== "number" || !Number.isInteger(vValue)) {
          const iConverted = parseInt(vValue, 10);
          if (!isNaN(iConverted) && String(iConverted) === String(vValue).trim()) {
            logConversion(sName, sEdmType, vValue, iConverted);
            oData[sName] = iConverted;
          } else {
            errors.push(`${sName} alanı integer olmalı, gelen: ${vValue} (${typeof vValue})`);
          }
        }
        break;
      }
      case "Edm.Decimal": {
        if (typeof vValue !== "string" || vValue.trim() === "" || isNaN(Number(vValue))) {
          if (typeof vValue === "number" && !isNaN(vValue)) {
            const sConverted = String(vValue);
            logConversion(sName, sEdmType, vValue, sConverted);
            oData[sName] = sConverted;
            vValue = sConverted;
          } else {
            errors.push(`${sName} alanı sayısal bir string (decimal) olmalı, gelen: ${vValue} (${typeof vValue})`);
            break;
          }
        }
        const iScale = oProp.scale ? parseInt(oProp.scale, 10) : null;
        if (iScale !== null) {
          const aParts = vValue.split(".");
          const iDecimalDigits = aParts[1] ? aParts[1].length : 0;
          if (iDecimalDigits > iScale) {
            errors.push(`${sName} alanı en fazla ${iScale} ondalık basamak olabilir, gelen: ${vValue}`);
          }
        }
        break;
      }
      case "Edm.Double":
      case "Edm.Single": {
        if (typeof vValue !== "number" || isNaN(vValue)) {
          const fConverted = Number(vValue);
          if (!isNaN(fConverted) && vValue !== "" && vValue !== null) {
            logConversion(sName, sEdmType, vValue, fConverted);
            oData[sName] = fConverted;
          } else {
            errors.push(`${sName} alanı sayısal (double) olmalı, gelen: ${vValue} (${typeof vValue})`);
          }
        }
        break;
      }
      case "Edm.Boolean": {
        if (typeof vValue !== "boolean") {
          const sLower = String(vValue).trim().toLowerCase();
          if (["true", "1"].includes(sLower)) {
            logConversion(sName, sEdmType, vValue, true);
            oData[sName] = true;
          } else if (["false", "0"].includes(sLower)) {
            logConversion(sName, sEdmType, vValue, false);
            oData[sName] = false;
          } else {
            errors.push(`${sName} alanı boolean olmalı, gelen: ${vValue} (${typeof vValue})`);
          }
        }
        break;
      }
      case "Edm.DateTime":
      case "Edm.DateTimeOffset": {
        if (!(vValue instanceof Date) || isNaN(vValue.getTime())) {
          const oConverted = new Date(vValue);
          if (!isNaN(oConverted.getTime())) {
            logConversion(sName, sEdmType, vValue, oConverted.toISOString());
            oData[sName] = oConverted;
          } else {
            errors.push(`${sName} alanı geçerli bir Date objesi olmalı, gelen: ${vValue}`);
          }
        }
        break;
      }
      default:
        break;
    }

    if (sEdmType === "Edm.String" && oProp.maxLength && typeof oData[sName] === "string") {
      const iMax = parseInt(oProp.maxLength, 10);
      if (!isNaN(iMax) && oData[sName].length > iMax) {
        errors.push(`${sName} alanı maksimum ${iMax} karakter olmalı, gelen uzunluk: ${oData[sName].length}`);
      }
    }
  });

  return errors.join("\n");
}
```

## Kullanım Örneği

```javascript
async onCreateOfferDialogSave() {
  let oForm = sap.ui.getCore().byId("idNewOfferForm");
  let oGlobalModel = this.getModel("globalModel");
  let oNewOffer = oGlobalModel.getProperty("/newOffer");

  // Tip dönüşümü/kontrolü elle yapılmıyor, ham değerler direkt veriliyor
  let oData = {
    Company: oNewOffer.company,
    Teu: oNewOffer.teu,
    Offername: null,
    Offerstatus: null,
    Customerid: oNewOffer.customerId,
    Fullname: oNewOffer.customerName,
    Opportunitycode: oNewOffer.opportunityId,
    Offervalue: oNewOffer.estimatedValue,
    Closedate: oNewOffer.closingDate,
    Visittrade: oNewOffer.tradeType,
    Cargotype: oNewOffer.containerType,
    Containercount: oNewOffer.containerCount,
    Offeruserid: oNewOffer.owner
  };

  // Tek satırda tüm alanları doğrula ve dönüştür
  const sOdataError = await this._getValidationItems(oData, "OfferSet");
  if (sOdataError) {
    console.warn("OData validation errors:", sOdataError);
    new this.ExToast({
      title: "Uyarı",
      message: sOdataError,
      type: "error",
      icon: "sap-icon://error",
      position: "top-center",
      duration: 5000
    }).show();
    return;
  }

  this.getModel().create("/OfferSet", oData, {
    success: () => {
      this.onCloseOfferDialog();
    },
    error: (oError) => {
      console.error(oError);
    }
  });
}
```

## Örnek Konsol Çıktısı

Otomatik dönüştürülen alanlar için:

```
[OfferSet] "Teu" alanı otomatik dönüştürüldü (Edm.Int32): eski değer = "12" (string) -> yeni değer = 12 (number)
[OfferSet] "Offervalue" alanı otomatik dönüştürüldü (Edm.Decimal): eski değer = 154.5 (number) -> yeni değer = "154.5" (string)
```

Dönüştürülemeyen / eksik alanlar için (`sOdataError` içinde döner):

```
Company alanı zorunludur (null/boş olamaz).
Containercount alanı integer olmalı, gelen: abc (string)
```

## Notlar / Sınırlamalar

- Metod **OData V2** metamodel API'sini kullanır (`getODataEntitySet`, `getODataEntityType`). OData V4 projelerinde metadata okuma şekli farklıdır (`requestObject` tabanlı, tamamen promise-based) ve bu metod doğrudan kullanılamaz.
- `oData` objesi metod içinde **referans üzerinden güncellenir** (mutasyona uğrar) — orijinal objeyi bozmadan çalışmak isterseniz çağırmadan önce `structuredClone(oData)` ile kopyalayın.
- `nullable` bilgisi backend metadata'sında doğru tanımlanmamışsa (örn. hepsi `true` işaretliyse), zorunlu alan kontrolü gerçek iş kuralını yansıtmayabilir.

## Lisans

Dahili/proje kullanımı için serbestçe uyarlanabilir.
