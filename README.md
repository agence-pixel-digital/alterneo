# Alternéo — application RH pour alternants

## 1. Configuration locale

1. Copiez `.env.example` en `.env` :
   ```
   cp .env.example .env
   ```
2. Ouvrez `.env` et remplissez avec vos informations Supabase (Project Settings → API) :
   - `SUPABASE_URL` = Project URL
   - `SUPABASE_ANON_KEY` = clé "publishable"
   - `SUPABASE_SERVICE_ROLE_KEY` = clé "secret"
   - `SESSION_SECRET` = n'importe quelle longue chaîne aléatoire

3. Installez les dépendances :
   ```
   npm install
   ```

## 2. Créer votre premier compte administrateur

L'application ne permet pas de s'inscrire soi-même (c'est volontaire, pour la sécurité).
Le tout premier compte admin doit être créé manuellement :

1. Dans Supabase → **Authentication** → **Users** → **Add user** → renseignez votre e-mail
   et un mot de passe → cochez "Auto Confirm User".
2. Copiez l'**UID** de l'utilisateur créé (visible dans la liste).
3. Allez dans **SQL Editor** et exécutez (remplacez les valeurs) :
   ```sql
   insert into profiles (id, role, prenom, nom, email)
   values ('COLLEZ-L-UID-ICI', 'admin', 'Sophie', 'Laurent', 'votre@email.fr');
   ```

## 3. Lancer l'application en local

```
npm start
```

Ouvrez http://localhost:3000 et connectez-vous avec le compte créé à l'étape 2.

## 4. Envoyer le code sur GitHub

```
git init
git add .
git commit -m "Première version de l'application Alternéo"
git branch -M main
git remote add origin https://github.com/VOTRE-COMPTE/alterneo-app.git
git push -u origin main
```

(Créez d'abord le dépôt vide sur github.com → "New repository", sans README, avant de faire le push.)

## 5. Déployer sur Hostinger

1. hPanel → **Websites** → **Add website** → **Node.js Apps**
2. Choisissez **Connect GitHub**, autorisez Hostinger, puis sélectionnez le dépôt `alterneo-app`.
3. Hostinger détecte automatiquement Node.js. Fichier d'entrée : `server.js`.
4. Dans **Environment Variables**, ajoutez les mêmes variables que dans votre `.env` local
   (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SESSION_SECRET).
5. Déployez. Hostinger vous donne une URL (ou vous pouvez brancher votre propre nom de domaine).

## Ce qui est déjà fonctionnel
- Connexion / déconnexion
- Tableau de bord admin et alternant
- Gestion des alternants (création de comptes)
- Congés : demande, validation, refus

## Prochaines étapes (modules à construire sur le même modèle)
- Heures supplémentaires
- Fiches de paie (dépôt PDF via Supabase Storage)
- Absences école
- Planning visuel
