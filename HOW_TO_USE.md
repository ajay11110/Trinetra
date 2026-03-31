# How to Use & Setup the Project on a New PC

When you clone this repository to a new computer, you will notice that certain folders and files (like `node_modules/`, `android/local.properties`, `android/build/`, and `.apk` files) are missing. 

These files are intentionally excluded from Git tracks (via `.gitignore`) because they are extremely large, system-specific, or generated automatically during the build process. 

Follow these exact steps to generate the missing files and run the project locally on your machine.

---

## Step 1: Install Node Dependencies
Instead of transferring the massive `node_modules` folder over Git, we track our libraries via `package.json`. 

Open your terminal in the project's root directory and run:
```bash
npm install
```
*This command reads the project configuration and downloads the entire `node_modules` folder fresh.*

## Step 2: Sync Capacitor Native Plugins
The bridge between our web application and the native Android shell requires specific Capacitor plugins. To recreate the `capacitor-cordova-android-plugins/` folder and link native dependencies, run:
```bash
npx cap sync android
```

## Step 3: Automatically Generate Android SDK Paths 
The `android/local.properties` file is intentionally ignored because it contains paths strictly tied to the previous computer's software installation (e.g., `C:\Users\Ajay\...\Android\Sdk`). 

To generate a correct version of this file specifically customized for your new PC:
1. Open the **Android Studio** application.
2. Select **Open** (or File > Open).
3. Select the `android` folder located inside this project directory.
4. *Android Studio will automatically detect your local Android SDK location and instantly generate the correct `local.properties` file for your computer.*

## Step 4: Build the App Outputs (`.apk`)
Final application files and temporary build folders (like `temp_build_apk/` or `android/build/`) are generated strictly from the source code.

To recreate the app outputs:
1. Execute the instructions in Step 3 to open the project in Android Studio.
2. Wait for Android Studio to sync the Gradle files (a loading bar will appear at the bottom).
3. Navigate to **Build > Build Bundle(s) / APK(s) > Build APK(s)** in the top menu.
*Android Studio will compile the code and generate your new `.apk` installation files and `build/` directories locally.*
