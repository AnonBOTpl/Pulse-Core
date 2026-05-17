use lofty::file::{AudioFile, TaggedFileExt};
use lofty::probe::Probe;
use lofty::tag::Accessor;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TrackMetadata {
    pub path: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub duration: f64,
}

pub fn extract_metadata(path: &str) -> Result<TrackMetadata, String> {
    let tagged_file = Probe::open(path)
        .map_err(|e| e.to_string())?
        .read()
        .map_err(|e| e.to_string())?;

    let properties = tagged_file.properties();
    let duration = properties.duration().as_secs_f64();

    let tag = tagged_file.primary_tag()
        .or_else(|| tagged_file.first_tag());

    let (title, artist) = if let Some(tag) = tag {
        (
            tag.title().map(|s| s.into_owned()),
            tag.artist().map(|s| s.into_owned()),
        )
    } else {
        (None, None)
    };

    Ok(TrackMetadata {
        path: path.to_string(),
        title,
        artist,
        duration,
    })
}
