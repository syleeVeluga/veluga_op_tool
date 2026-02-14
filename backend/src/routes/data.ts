import { Router } from "express";
import { isDataType, supportedDataTypes } from "../config/schema";
import { getSchemaByDataType } from "../services/schemaProvider";

const dataRouter = Router();

dataRouter.get("/schema/:dataType", (req, res) => {
  const { dataType } = req.params;

  if (!isDataType(dataType)) {
    res.status(400).json({
      error: "invalid_data_type",
      message: `Unsupported dataType: ${dataType}`,
      supportedDataTypes,
    });
    return;
  }

  const schema = getSchemaByDataType(dataType);

  res.status(200).json(schema);
});

export { dataRouter };
