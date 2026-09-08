import { ID3Writer } from "browser-id3-writer";

/**
 * Writes a fresh ID3v2.3 tag onto a copy of the given audio file and
 * returns the resulting Blob. The library replaces any existing tag
 * wholesale, so the caller must pass through every field it wants kept
 * (not just the ones being changed) — e.g. pass the current album/year
 * back in even if the user is only editing the title.
 */
export async function writeId3Tags(file, { title, artist, album, year, isrc, pictureBlob }) {
  const arrayBuffer = await file.arrayBuffer();
  const writer = new ID3Writer(arrayBuffer);

  if (title) writer.setFrame("TIT2", title);
  if (artist) writer.setFrame("TPE1", [artist]);
  if (album) writer.setFrame("TALB", album);
  if (year) writer.setFrame("TYER", Number(year));
  if (isrc) writer.setFrame("TSRC", isrc);

  if (pictureBlob) {
    const pictureData = await pictureBlob.arrayBuffer();
    writer.setFrame("APIC", {
      type: 3, // "Cover (front)"
      data: pictureData,
      description: "",
      useUnicodeEncoding: false,
    });
  }

  writer.addTag();
  return writer.getBlob();
}
