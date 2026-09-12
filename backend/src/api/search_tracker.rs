use chrono::Utc;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Strips diacritics and accents (supports Vietnamese and European Latin letters)
/// for robust fuzzy and case-insensitive search matching.
pub fn normalize_diacritics(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for c in input.chars() {
        let replacement = match c {
            // Vietnamese & Latin A
            'a' | 'A' | 'á' | 'Á' | 'à' | 'À' | 'ả' | 'Ả' | 'ã' | 'Ã' | 'ạ' | 'Ạ'
            | 'â' | 'Â' | 'ấ' | 'Ấ' | 'ầ' | 'Ầ' | 'ẩ' | 'Ẩ' | 'ẫ' | 'Ẫ' | 'ậ' | 'Ậ'
            | 'ă' | 'Ă' | 'ắ' | 'Ắ' | 'ằ' | 'Ằ' | 'ẳ' | 'Ẳ' | 'ẵ' | 'Ẵ' | 'ặ' | 'Ặ'
            | 'ä' | 'Ä' | 'å' | 'Å' | 'ā' | 'Ā' => 'a',

            // Vietnamese D
            'đ' | 'Đ' => 'd',

            // Vietnamese & Latin E
            'e' | 'E' | 'é' | 'É' | 'è' | 'È' | 'ẻ' | 'Ẻ' | 'ẽ' | 'Ẽ' | 'ẹ' | 'Ẹ'
            | 'ê' | 'Ê' | 'ế' | 'Ế' | 'ề' | 'Ề' | 'ể' | 'Ể' | 'ễ' | 'Ễ' | 'ệ' | 'Ệ'
            | 'ë' | 'Ë' | 'ē' | 'Ē' => 'e',

            // Vietnamese & Latin I
            'i' | 'I' | 'í' | 'Í' | 'ì' | 'Ì' | 'ỉ' | 'Ỉ' | 'ĩ' | 'Ĩ' | 'ị' | 'Ị'
            | 'ï' | 'Ï' | 'ī' | 'Ī' => 'i',

            // Vietnamese & Latin O
            'o' | 'O' | 'ó' | 'Ó' | 'ò' | 'Ò' | 'ỏ' | 'Ỏ' | 'õ' | 'Õ' | 'ọ' | 'Ọ'
            | 'ô' | 'Ô' | 'ố' | 'Ố' | 'ồ' | 'Ồ' | 'ổ' | 'Ổ' | 'ỗ' | 'Ỗ' | 'ộ' | 'Ộ'
            | 'ơ' | 'Ơ' | 'ớ' | 'Ớ' | 'ờ' | 'Ờ' | 'ở' | 'Ở' | 'ỡ' | 'Ỡ' | 'ợ' | 'Ợ'
            | 'ö' | 'Ö' | 'ø' | 'Ø' | 'ō' | 'Ō' => 'o',

            // Vietnamese & Latin U
            'u' | 'U' | 'ú' | 'Ú' | 'ù' | 'Ù' | 'ủ' | 'Ủ' | 'ũ' | 'Ũ' | 'ụ' | 'Ụ'
            | 'ư' | 'Ư' | 'ứ' | 'Ứ' | 'ừ' | 'Ừ' | 'ử' | 'Ử' | 'ữ' | 'Ữ' | 'ự' | 'Ự'
            | 'ü' | 'Ü' | 'ū' | 'Ū' => 'u',

            // Vietnamese & Latin Y
            'y' | 'Y' | 'ý' | 'Ý' | 'ỳ' | 'Ỳ' | 'ỷ' | 'Ỷ' | 'ỹ' | 'Ỹ' | 'ỵ' | 'Ỵ'
            | 'ÿ' | 'Ÿ' => 'y',

            // Other accented Latin characters
            'ç' | 'Ç' => 'c',
            'ñ' | 'Ñ' => 'n',
            'ß' => 's',

            other => other.to_ascii_lowercase(),
        };
        out.push(replacement);
    }
    out
}

#[derive(Debug, Default)]
struct TrackerInner {
    // Map of original query display string -> list of epoch second timestamps
    history: HashMap<String, Vec<i64>>,
}

#[derive(Clone)]
pub struct SearchVelocityTracker {
    inner: Arc<RwLock<TrackerInner>>,
}

impl Default for SearchVelocityTracker {
    fn default() -> Self {
        Self::new()
    }
}

impl SearchVelocityTracker {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(RwLock::new(TrackerInner::default())),
        }
    }

    /// Record a search query and its timestamp
    pub async fn record_query(&self, raw_query: &str) {
        let trimmed = raw_query.trim();
        if trimmed.len() < 2 || trimmed.len() > 100 {
            return;
        }

        let now = Utc::now().timestamp();
        let cutoff_24h = now - 86400;

        let mut lock = self.inner.write().await;
        let entry = lock.history.entry(trimmed.to_string()).or_default();
        entry.push(now);

        // Prune old entries if history grows too large
        if lock.history.len() > 500 {
            lock.history.retain(|_, timestamps| {
                timestamps.retain(|&ts| ts >= cutoff_24h);
                !timestamps.is_empty()
            });
        }
    }

    /// Calculate trending queries based on real-time velocity (1h surge + 24h volume)
    pub async fn get_trending_queries(&self, limit: usize) -> Vec<String> {
        let now = Utc::now().timestamp();
        let cutoff_1h = now - 3600;
        let cutoff_24h = now - 86400;

        let lock = self.inner.read().await;
        let mut scored: Vec<(String, f64)> = Vec::new();

        for (query, timestamps) in lock.history.iter() {
            let count_1h = timestamps.iter().filter(|&&ts| ts >= cutoff_1h).count() as f64;
            let count_24h = timestamps.iter().filter(|&&ts| ts >= cutoff_24h).count() as f64;

            if count_24h > 0.0 {
                // Velocity formula: 3x weighting on recent 1h surge + 1x on 24h baseline
                let score = count_1h * 3.0 + count_24h;
                scored.push((query.clone(), score));
            }
        }

        scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        scored.into_iter().take(limit).map(|(q, _)| q).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_diacritic_normalization() {
        assert_eq!(normalize_diacritics("Sơn Tùng M-TP"), "son tung m-tp");
        assert_eq!(normalize_diacritics("Đừng Làm Trái Tim Anh Đau"), "dung lam trai tim anh dau");
        assert_eq!(normalize_diacritics("Cà Phê"), "ca phe");
        assert_eq!(normalize_diacritics("Björk"), "bjork");
    }

    #[tokio::test]
    async fn test_velocity_tracking() {
        let tracker = SearchVelocityTracker::new();
        tracker.record_query("Taylor Swift").await;
        tracker.record_query("Taylor Swift").await;
        tracker.record_query("Sơn Tùng").await;

        let trending = tracker.get_trending_queries(10).await;
        assert_eq!(trending.first().unwrap(), "Taylor Swift");
    }
}
