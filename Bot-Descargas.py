import os
import yt_dlp

# Ruta absoluta personalizada donde se guardarán los MP3
CARPETA_DESTINO = "/home/mario/canciones_server"

def descargar_cancion(busqueda: str, bitrate: str = "192"):
    """
    Busca y descarga el audio de una canción en formato MP3 desde YouTube.
    Acepta tanto nombres de canciones ("kanye west stronger") como URLs directas.
    """
    # 1. Crear la carpeta en /home/mario/ si aún no existe
    if not os.path.exists(CARPETA_DESTINO):
        os.makedirs(CARPETA_DESTINO, exist_ok=True)
        print(f"📁 Carpeta creada: {CARPETA_DESTINO}")

    # 2. Configuración de yt-dlp
    ydl_opts = {
        'default_search': 'ytsearch1',
        'format': 'bestaudio/best',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': bitrate,
        }],
        # Plantilla para la ruta de salida en tu carpeta destino
        'outtmpl': os.path.join(CARPETA_DESTINO, '%(title)s.%(ext)s'),
        'quiet': False,     # Muestra la barra de progreso en tiempo real
        'no_warnings': True,
    }

    # 3. Preparar el término de búsqueda o enlace
    if not busqueda.startswith("http://") and not busqueda.startswith("https://"):
        query = f"ytsearch1:{busqueda} audio"
    else:
        query = busqueda

    # 4. Proceso de descarga y conversión
    try:
        print(f"\n🔍 Buscando y procesando: '{busqueda}'...")
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(query, download=True)
            
            # Obtener el título real de la canción procesada
            if 'entries' in info and len(info['entries']) > 0:
                titulo = info['entries'][0].get('title', 'cancion')
            else:
                titulo = info.get('title', 'cancion')

            ruta_final = os.path.join(CARPETA_DESTINO, f"{titulo}.mp3")
            
            print("\n" + "="*50)
            print("✅ ¡Descarga completada con éxito!")
            print(f"🎵 Canción: {titulo}")
            print(f"📂 Archivo guardado en: {ruta_final}")
            print("="*50 + "\n")
            
            return ruta_final

    except Exception as e:
        print(f"\n❌ Ocurrió un error al intentar descargar: {e}\n")
        return None

# --- Bucle de ejecución interactivo ---
if __name__ == "__main__":
    print("===========================================")
    print("   BOT DESCARGADOR DE AUDIO - YT-DLP")
    print(f"   Destino: {CARPETA_DESTINO}")
    print("===========================================\n")
    
    while True:
        entrada = input("Escribe la canción o link (o 'salir' para cerrar): ").strip()
        
        if entrada.lower() in ['salir', 'exit', 'q']:
            print("¡Hasta luego!")
            break
            
        if entrada:
            descargar_cancion(entrada)