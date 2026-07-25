export interface FileRowError {
  row: number;
  error: string;
}

export interface FileDto {
  id: string;
  sourceId: string;
  filename: string;
  contentHash: string;
  rowCount: number;
  errorCount: number;
  status: string;
  errors: FileRowError[];
  createdAt: string;
}

export interface FileUploadResultDto extends FileDto {
  duplicate: boolean; // true if this exact file (by content hash) was already imported
}
