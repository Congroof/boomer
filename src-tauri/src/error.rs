use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("参数校验错误: {0}")]
    Validation(String),

    #[error("未找到资源: {0}")]
    NotFound(String),

    #[error("本地存储错误: {0}")]
    Storage(String),

    #[error("网络请求错误: {0}")]
    Network(String),

    #[error("任务状态冲突: {0}")]
    TaskState(String),

    #[error("内部系统错误: {0}")]
    Internal(String),
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        Self::Storage(err.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        Self::Storage(err.to_string())
    }
}

impl From<reqwest::Error> for AppError {
    fn from(err: reqwest::Error) -> Self {
        Self::Network(err.to_string())
    }
}

/// Serialize AppError cleanly to a structured JSON payload or readable message for Tauri IPC.
impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
