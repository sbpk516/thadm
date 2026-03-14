use anyhow::{anyhow, Result};
use std::{
    panic::AssertUnwindSafe,
    path::PathBuf,
    sync::{Arc, Mutex as StdMutex},
};
use tracing::{info, warn};

use crate::speaker::{
    embedding::EmbeddingExtractor,
    embedding_manager::EmbeddingManager,
    models::{get_or_download_model, redownload_model, PyannoteModel},
};

pub struct SegmentationManager {
    pub embedding_manager: EmbeddingManager,
    pub embedding_extractor: Arc<StdMutex<EmbeddingExtractor>>,
    pub segmentation_model_path: PathBuf,
}

impl SegmentationManager {
    pub async fn new() -> Result<Self> {
        let segmentation_model_path = match get_or_download_model(PyannoteModel::Segmentation).await
        {
            Ok(p) => p,
            Err(e) => {
                warn!("Failed to get segmentation model, speaker diarization disabled: {}", e);
                PathBuf::new()
            }
        };

        let embedding_extractor = match Self::load_embedding_extractor().await {
            Ok(extractor) => extractor,
            Err(e) => {
                warn!(
                    "Speaker diarization disabled — embedding model unavailable: {}",
                    e
                );
                Arc::new(StdMutex::new(EmbeddingExtractor::disabled()))
            }
        };

        let embedding_manager = EmbeddingManager::new(usize::MAX);
        Ok(SegmentationManager {
            embedding_manager,
            embedding_extractor,
            segmentation_model_path,
        })
    }

    async fn load_embedding_extractor() -> Result<Arc<StdMutex<EmbeddingExtractor>>> {
        let embedding_model_path = get_or_download_model(PyannoteModel::Embedding).await?;

        // Try loading the model
        match Self::try_load_extractor(&embedding_model_path) {
            Ok(extractor) => Ok(extractor),
            Err(e) => {
                warn!(
                    "Failed to load embedding model, deleting and re-downloading: {}",
                    e
                );
                // Try re-downloading once
                match redownload_model(PyannoteModel::Embedding).await {
                    Ok(new_path) => {
                        info!("Re-downloaded embedding model to {:?}", new_path);
                        Self::try_load_extractor(&new_path)
                    }
                    Err(dl_err) => Err(anyhow!(
                        "Re-download also failed: {} (original error: {})",
                        dl_err,
                        e
                    )),
                }
            }
        }
    }

    fn try_load_extractor(path: &PathBuf) -> Result<Arc<StdMutex<EmbeddingExtractor>>> {
        let path_str = path
            .to_str()
            .ok_or_else(|| anyhow!("Invalid embedding model path"))?;
        // ORT can panic on corrupted ONNX files — catch it
        let result =
            std::panic::catch_unwind(AssertUnwindSafe(|| EmbeddingExtractor::new(path_str)));
        let extractor = match result {
            Ok(Ok(ext)) => ext,
            Ok(Err(e)) => return Err(e),
            Err(_) => return Err(anyhow!("ONNX model load panicked for {:?}", path)),
        };
        Ok(Arc::new(StdMutex::new(extractor)))
    }
}
