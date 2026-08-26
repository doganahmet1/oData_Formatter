function normalizeEntitySetName(entitySetName) {
  return String(entitySetName || "").replace(/^\//, "");
}

function findEntityTypeForSet(serviceMetadata, entitySetName) {
  const normalizedSetName = normalizeEntitySetName(entitySetName);
  const schemas =
    serviceMetadata &&
    serviceMetadata.dataServices &&
    Array.isArray(serviceMetadata.dataServices.schema)
      ? serviceMetadata.dataServices.schema
      : [];

  for (const schema of schemas) {
    const containers = Array.isArray(schema.entityContainer) ? schema.entityContainer : [];
    for (const container of containers) {
      const entitySets = Array.isArray(container.entitySet) ? container.entitySet : [];
      const targetSet = entitySets.find((set) => set && set.name === normalizedSetName);

      if (!targetSet || !targetSet.entityType) {
        continue;
      }

      const [namespace, entityName] = targetSet.entityType.split(".");
      const targetSchema = schemas.find((item) => item && item.namespace === namespace);
      const entityTypes = targetSchema && Array.isArray(targetSchema.entityType) ? targetSchema.entityType : [];
      const entityType = entityTypes.find((item) => item && item.name === entityName);

      if (entityType) {
        return entityType;
      }
    }
  }

  return null;
}

function parseDate(value) {
  if (value instanceof Date || value == null) {
    return value;
  }

  if (typeof value === "string") {
    const odataDateMatch = value.match(/^\/Date\((-?\d+)\)\/$/);
    if (odataDateMatch) {
      return new Date(Number(odataDateMatch[1]));
    }
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date;
}

function toBoolean(value) {
  if (typeof value === "boolean" || value == null) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }

    if (normalized === "false") {
      return false;
    }
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  return Boolean(value);
}

function toNumber(value) {
  if (typeof value === "number" || value == null) {
    return value;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : value;
}

const EDM_TYPE_CONVERTERS = {
  "Edm.Boolean": toBoolean,
  "Edm.Byte": toNumber,
  "Edm.SByte": toNumber,
  "Edm.Int16": toNumber,
  "Edm.Int32": toNumber,
  "Edm.Single": toNumber,
  "Edm.Double": toNumber,
  "Edm.Float": toNumber,
  "Edm.Decimal": (value) => (value == null ? value : String(value)),
  "Edm.Int64": (value) => (value == null ? value : String(value)),
  "Edm.DateTime": parseDate,
  "Edm.DateTimeOffset": parseDate
};

function formatPayloadForEntitySet(modelOrMetadata, entitySetName, payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("payload must be an object");
  }

  const serviceMetadata =
    modelOrMetadata && typeof modelOrMetadata.getServiceMetadata === "function"
      ? modelOrMetadata.getServiceMetadata()
      : modelOrMetadata;

  if (!serviceMetadata) {
    throw new Error("Service metadata could not be resolved");
  }

  const entityType = findEntityTypeForSet(serviceMetadata, entitySetName);
  if (!entityType || !Array.isArray(entityType.property)) {
    return { ...payload };
  }

  const formattedPayload = { ...payload };

  for (const property of entityType.property) {
    if (!property || !Object.prototype.hasOwnProperty.call(payload, property.name)) {
      continue;
    }

    const convert = EDM_TYPE_CONVERTERS[property.type];
    if (!convert) {
      continue;
    }

    formattedPayload[property.name] = convert(payload[property.name]);
  }

  return formattedPayload;
}

module.exports = {
  formatPayloadForEntitySet
};
