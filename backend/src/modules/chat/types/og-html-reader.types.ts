export type OgHtmlReaderOk = {
  kind: 'ok';
  finalUrl: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  httpStatus: number;
  htmlLength: number;
  suspectedLoginWall: boolean;
};

export type OgHtmlReaderResult =
  | OgHtmlReaderOk
  | { kind: 'timeout' }
  | { kind: 'blocked' }
  | { kind: 'http_error'; httpStatus: number }
  | { kind: 'empty_response' };
