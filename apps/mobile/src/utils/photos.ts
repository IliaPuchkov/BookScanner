import type { BookPhoto } from "../types";

// List screens show the small cover thumbnail (~12 KB) when the backend has
// generated one, otherwise the full photo (~800 KB). Detail screens use
// fileUrl directly.
export const thumbUri = (photo: Pick<BookPhoto, "fileUrl" | "thumbnailUrl">) =>
  photo.thumbnailUrl || photo.fileUrl;
