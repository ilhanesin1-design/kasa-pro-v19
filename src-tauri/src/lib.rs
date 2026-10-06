use std::time::Duration;

#[tauri::command]
async fn fetch_tcmb_xml() -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .user_agent("KASA PRO V19")
        .build()
        .map_err(|e| format!("TCMB istemcisi oluşturulamadı: {e}"))?;

    client
        .get("https://www.tcmb.gov.tr/kurlar/today.xml")
        .send()
        .await
        .map_err(|e| format!("TCMB bağlantısı kurulamadı: {e}"))?
        .error_for_status()
        .map_err(|e| format!("TCMB yanıtı başarısız: {e}"))?
        .text()
        .await
        .map_err(|e| format!("TCMB verisi okunamadı: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run(){
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![fetch_tcmb_xml])
        .run(tauri::generate_context!())
        .expect("error while running KASA PRO V19");
}
