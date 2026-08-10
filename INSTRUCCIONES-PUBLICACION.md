# Electro Roun — instrucciones de publicación

Este proyecto contiene la página independiente de Electro Roun.

## Incluye

- Catálogo sincronizado en modo lectura con los productos de AmarangoElectro.
- Navegación automática por categorías.
- Fotos del proveedor para productos automáticos.
- Productos manuales sin fotografía, para que Electro Roun cargue las propias.
- Calculadora y generador de placas protegidos por sesión.
- Acceso general para vendedores y accesos administrativos para Marce y Cori.

## Publicación

1. Subir todo el contenido de esta carpeta a un repositorio nuevo de GitHub exclusivo de Electro Roun.
2. Conectar ese repositorio a un servicio compatible con aplicaciones Next/Vinext sobre Cloudflare Workers.
3. Configurar las variables indicadas en `.env.example` como valores secretos en el servidor.
4. Ejecutar `npm ci` y luego `npm run build`.
5. Publicar el contenido generado por el proceso de compilación.

No conectar este proyecto al repositorio de AmarangoElectro ni reemplazar sus archivos.

## Seguridad

Las contraseñas no están incluidas dentro del ZIP. Deben cargarse como variables secretas del servidor. Se recomienda cambiarlas antes de la publicación definitiva.
