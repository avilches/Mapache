# Publicar la app para pruebas (Expo Go + EAS Update)

Permite que un amigo pruebe la app sin estar en la misma red WiFi.
No requiere cuenta de Apple Developer. Gratis en el tier básico de Expo.

## Pasos iniciales (solo la primera vez)

### 1. Instalar EAS CLI
```bash
npm install -g eas-cli
```

### 2. Login en Expo
```bash
eas login
```
Crear cuenta en expo.dev si no tienes.

### 3. Configurar EAS en el proyecto
```bash
cd mobile
eas init
```
Esto añade `extra.eas.projectId` a `app.json`.

### 4. Configurar updates en `app.json`
```json
{
  "expo": {
    "updates": {
      "url": "https://u.expo.dev/TU-PROJECT-ID"
    },
    "runtimeVersion": {
      "policy": "appVersion"
    }
  }
}
```

## Publicar una actualización

```bash
cd mobile
eas update --branch main --message "descripción del cambio"
```

## Compartir con el amigo

1. El amigo descarga **Expo Go** de la App Store (gratis)
2. Le mandas el link del proyecto desde expo.dev, o un QR desde el dashboard
3. Las actualizaciones futuras le llegan automáticamente al abrir la app

## Limitaciones

- Si cambias **código nativo** (nueva librería con módulo nativo), necesitas un build nuevo
- Para cambios de JS/pantallas funciona sin build adicional