use lofty::file::{AudioFile, TaggedFileExt};
use lofty::probe::Probe;
use lofty::tag::Accessor;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Serialize, Deserialize, Clone, sqlx::FromRow)]
pub struct TrackMetadata {
    pub path: String,
    pub title: String,
    pub artist: String,
    pub duration: f64,
    pub available: i32,
    pub format: String,
    pub sample_rate: u32,
    pub bitrate: u32,
}

pub fn extract_metadata(path_str: &str) -> Result<TrackMetadata, String> {
    let path = Path::new(path_str);

    let tagged_file = Probe::open(path)
        .map_err(|e| format!("Błąd otwierania pliku: {}", e))?
        .read()
        .map_err(|e| format!("Błąd odczytu tagów: {}", e))?;

    let properties = tagged_file.properties();
    let duration = properties.duration().as_secs_f64();
    let sample_rate = properties.sample_rate().unwrap_or(0);
    let bitrate = properties.audio_bitrate()
        .or_else(|| properties.overall_bitrate())
        .unwrap_or(0);
    let format = path.extension()
        .and_then(|s| s.to_str())
        .unwrap_or("Unknown")
        .to_uppercase();

    let tag = tagged_file.primary_tag()
        .or_else(|| tagged_file.first_tag());

    let (mut title, mut artist) = if let Some(tag) = tag {
        (
            tag.title().map(|s| s.into_owned()),
            tag.artist().map(|s| s.into_owned()),
        )
    } else {
        (None, None)
    };

    // Logika oczyszczania nazwy pliku, jeśli brakuje tagów
    if title.is_none() {
        let file_name = path.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Nieznany utwór");

        if file_name.contains(" - ") {
            let parts: Vec<&str> = file_name.splitn(2, " - ").collect();
            artist = Some(parts[0].to_string());
            title = Some(parts[1].to_string());
        } else {
            title = Some(file_name.to_string());
        }
    }

    Ok(TrackMetadata {
        path: path_str.to_string(),
        title: title.unwrap_or_else(|| "Nieznany utwór".to_string()),
        artist: artist.unwrap_or_else(|| "Nieznany wykonawca".to_string()),
        duration,
        available: 1,
        format,
        sample_rate,
        bitrate,
    })
}
