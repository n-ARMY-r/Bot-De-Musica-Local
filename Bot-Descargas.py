import os
import sys
import re
import yt_dlp

CARPETA_DESTINO = "/home/mario/canciones_server"

def limpiar_nombre(nombre):
    # Eliminar caracteres no permitidos y dejar solo letras, numeros, espacios y guiones
    nombre = re.sub(r'[|<>:"/\\?*]', '', nombre)
    nombre = re.sub(r'\s+', ' ', nombre).strip()
    return nombre

def descargar_cancion(busqueda: str, bitrate: str = "192"):
    if not os.path.exists(CARPETA_DESTINO):
        os.makedirs(CARPETA_DESTINO, exist_ok=True)

    ydl_opts = {
        'default_search': 'ytsearch1',
        'format': 'bestaudio/best',
        'extractor_args': {'youtube': {'player_client': ['tv_embedded']}},
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': bitrate,
        }],
        'outtmpl': os.path.join(CARPETA_DESTINO, '%(title)s.%(ext)s'),
        'quiet': False,
        'no_warnings': True,
        # Limpiar el nombre del archivo
        'restrictfilenames': False,
        'trim_filenames': 200,
    }

    if not busqueda.startswith("http://") and not busqueda.startswith("https://"):
        query = f"ytsearch1:{busqueda}"
    else:
        query = busqueda

    try:
        print(f"\n Buscando: '{busqueda}'...")
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(query, download=False)
            
            if 'entries' in info and len(info['entries']) > 0:
                titulo_original = info['entries'][0].get('title', 'cancion')
            else:
                titulo_original = info.get('title', 'cancion')

            # Limpiar el nombre
            titulo_limpio = limpiar_nombre(titulo_original)
            
            # Cambiar la plantilla con el nombre limpio
            ydl_opts['outtmpl'] = os.path.join(CARPETA_DESTINO, f'{titulo_limpio}.%(ext)s')
            
        # Descargar con nombre limpio
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([query])

        ruta_final = os.path.join(CARPETA_DESTINO, f"{titulo_limpio}.mp3")
        print(f"\nDescarga completada: {titulo_limpio}")
        print(f"Guardado en: {ruta_final}")
        return ruta_final

    except Exception as e:
        print(f"\nError al descargar: {e}\n")
        return None

# Modo automatico llamado desde Node.js
if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "--auto":
        busqueda = " ".join(sys.argv[2:])
        descargar_cancion(busqueda)
    else:
        # Modo interactivo normal
        print("===========================================")
        print("   BOT DESCARGADOR DE AUDIO")
        print(f"   Destino: {CARPETA_DESTINO}")
        print("===========================================\n")
        
        while True:
            entrada = input("Escribe la cancion o link (o 'salir' para cerrar): ").strip()
            if entrada.lower() in ['salir', 'exit', 'q']:
                print("Hasta luego!")
                break
            if entrada:
                descargar_cancion(entrada)