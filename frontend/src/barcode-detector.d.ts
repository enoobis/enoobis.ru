interface barcode_detector_options {
  formats?: string[];
}

interface detected_barcode {
  rawValue: string;
}

declare class BarcodeDetector {
  constructor(opts?: barcode_detector_options);
  detect(source: ImageBitmapSource): Promise<detected_barcode[]>;
}
