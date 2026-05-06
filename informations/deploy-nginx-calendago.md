# Déploiement domaine `calendago.fr` (serveur dev)

Ce document trace la configuration serveur appliquée manuellement pour passer de `onadapp.com` à `calendago.fr` en HTTPS.

## Objectif

- Domaine principal: `https://calendago.fr`
- Redirection de compatibilité:
  - `https://onadapp.com` -> `https://calendago.fr`
  - `https://www.onadapp.com` -> `https://calendago.fr`
  - `https://www.calendago.fr` -> `https://calendago.fr`
- HTTPS avec renouvellement automatique Let’s Encrypt

## Fichier Nginx utilisé

Fichier serveur actif:
- `/etc/nginx/sites-available/onadapp.com`
- lien actif: `/etc/nginx/sites-enabled/onadapp.com`

## Configuration Nginx appliquée

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name calendago.fr www.calendago.fr onadapp.com www.onadapp.com;

    location /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
    }

    location / {
        return 301 https://calendago.fr$request_uri;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name calendago.fr;

    ssl_certificate /etc/letsencrypt/live/calendago.fr/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/calendago.fr/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    client_max_body_size 20m;

    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:3000/uploads/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name www.calendago.fr;

    ssl_certificate /etc/letsencrypt/live/calendago.fr/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/calendago.fr/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    return 301 https://calendago.fr$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name onadapp.com www.onadapp.com;

    ssl_certificate /etc/letsencrypt/live/onadapp.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/onadapp.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    return 301 https://calendago.fr$request_uri;
}
```

## Certificats

Commande exécutée:

```bash
sudo certbot certonly --standalone -d calendago.fr -d www.calendago.fr -m onadapp0@gmail.com --agree-tos --non-interactive --keep-until-expiring
```

Certificat créé:
- `/etc/letsencrypt/live/calendago.fr/fullchain.pem`
- `/etc/letsencrypt/live/calendago.fr/privkey.pem`

Le renouvellement automatique est assuré par `certbot.timer`.

## Vérifications réalisées

```bash
sudo nginx -t
sudo systemctl reload nginx
curl -I http://calendago.fr
curl -I https://calendago.fr
curl -Ik https://onadapp.com
```

Résultat attendu:
- `https://calendago.fr` retourne `200`
- `onadapp.com` redirige vers `https://calendago.fr`
