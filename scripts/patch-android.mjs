import { cp, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const androidRoot = resolve(root, "android");
const packagePath = "uz/yoz/qr";
const javaSourceDirectory = resolve(root, "native", "android", ...packagePath.split("/"));
const javaTargetDirectory = resolve(androidRoot, "app", "src", "main", "java", ...packagePath.split("/"));
const manifestPath = resolve(androidRoot, "app", "src", "main", "AndroidManifest.xml");

async function findMainActivity(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      const found = await findMainActivity(path);
      if (found) return found;
    } else if (entry.name === "MainActivity.java") {
      return path;
    }
  }
  return null;
}

const activityPath = await findMainActivity(resolve(androidRoot, "app", "src", "main", "java"));
if (!activityPath) throw new Error("Capacitor MainActivity.java was not generated.");

await cp(javaSourceDirectory, javaTargetDirectory, { recursive: true });

let activity = await readFile(activityPath, "utf8");
if (!activity.includes("NativeBridgePlugin")) {
  activity = activity.replace(
    /import com\.getcapacitor\.BridgeActivity;/,
    "import android.os.Bundle;\nimport com.getcapacitor.BridgeActivity;\nimport uz.yoz.qr.NativeBridgePlugin;"
  );
  activity = activity.replace(
    /public class MainActivity extends BridgeActivity\s*\{/,
    "public class MainActivity extends BridgeActivity {\n    @Override\n    protected void onCreate(Bundle savedInstanceState) {\n        registerPlugin(NativeBridgePlugin.class);\n        super.onCreate(savedInstanceState);\n    }"
  );
}

activity = activity.replace(/\n\s*\}\s*\}\s*$/, "\n    }\n}\n");
if (!activity.includes("registerPlugin(NativeBridgePlugin.class)")) {
  throw new Error(`Could not register the native bridge in ${relative(androidRoot, activityPath).split(sep).join("/")}.`);
}
await writeFile(activityPath, activity);

let manifest = await readFile(manifestPath, "utf8");
const permissions = [
  '    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
  '    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />',
  '    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28" />'
];
for (const permission of permissions) {
  const permissionName = permission.match(/android:name="([^"]+)"/)[1];
  if (!manifest.includes(`android:name="${permissionName}"`)) {
    manifest = manifest.replace("<application", `${permission}\n    <application`);
  }
}

if (!manifest.includes("uz.yoz.qr.ReminderReceiver")) {
  manifest = manifest.replace(
    "</application>",
    `        <receiver android:name="uz.yoz.qr.ReminderReceiver" android:enabled="true" android:exported="false" />\n        <receiver android:name="uz.yoz.qr.ReminderBootReceiver" android:enabled="true" android:exported="true">\n            <intent-filter>\n                <action android:name="android.intent.action.BOOT_COMPLETED" />\n            </intent-filter>\n        </receiver>\n    </application>`
  );
}

if (manifest === await readFile(manifestPath, "utf8") && !manifest.includes("uz.yoz.qr.ReminderReceiver")) {
  throw new Error("Could not add reminder receivers to AndroidManifest.xml.");
}

await writeFile(manifestPath, manifest);
console.log("Registered gallery/reminder plugin and Android notification receivers.");
