/**
 * Taj Al-Mawadah Desktop — Main Process (المرحلة 1 و 2)
 * مدمج بالكامل: نافذة آمنة + Single-instance + Tray + تشغيل تلقائي
 * + محرك العتاد وشبكات الإيثرنت والواي فاي والبوابات (Gateway) وفحص المنافذ والطباعة الخام مباشرة
 */
const { app, BrowserWindow, Tray, Menu, ipcMain, shell, nativeImage, dialog } = require('electron');
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const { exec } = require('child_process');

const isWin = process.platform === 'win32';
const isDev = !app.isPackaged;
const DEV_URL = 'http://localhost:3000';
const configPath = () => path.join(app.getPath('userData'), 'config.json');
const dataLocationConfigPath = () => path.join(app.getPath('appData'), 'Taj Al-Mawadah POS', 'data-location.json');
const DATA_LOCATION_MARKER_PREFIX = '.taj-mawadah-data-move-';
const OFFLINE_QUEUE_SCHEMA_VERSION = 1;
let offlineQueueDb = null;
let activeDataDirectory = null;
let selectedDataDirectory = null;
let dataLocationMigrationError = null;

function readDataLocationConfig() {
  try {
    const value = JSON.parse(fs.readFileSync(dataLocationConfigPath(), 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('ملف إعداد موقع التخزين غير صالح');
    }
    return value;
  } catch (error) {
    if (error?.code === 'ENOENT') return {};
    throw error;
  }
}

function writeDataLocationConfig(value) {
  const filePath = dataLocationConfigPath();
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(value, null, 2), { flag: 'wx' });
  try {
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    try { fs.rmSync(temporaryPath, { force: true }); } catch {}
    throw error;
  }
}

function normalizeDataDirectory(value, label) {
  if (typeof value !== 'string' || !value.trim() || !path.isAbsolute(value)) {
    throw new Error(`${label} غير صالح`);
  }
  return path.resolve(value);
}

function comparableDataPath(value) {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isSameOrNestedDataPath(parentPath, childPath) {
  const parent = comparableDataPath(parentPath);
  const child = comparableDataPath(childPath);
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function assertSafeDataMovePaths(sourcePath, targetPath) {
  const source = normalizeDataDirectory(sourcePath, 'مجلد البيانات الحالي');
  const target = normalizeDataDirectory(targetPath, 'مجلد البيانات الجديد');
  if (comparableDataPath(source) === comparableDataPath(target)) {
    const error = new Error('المجلد المحدد هو مجلد البيانات الحالي بالفعل');
    error.code = 'SAME_DATA_DIRECTORY';
    throw error;
  }
  if (isSameOrNestedDataPath(source, target) || isSameOrNestedDataPath(target, source)) {
    const error = new Error('يجب اختيار مجلد مستقل خارج مجلد البيانات الحالي');
    error.code = 'NESTED_DATA_DIRECTORY';
    throw error;
  }
  if (path.parse(target).root === target) {
    const error = new Error('لا يمكن استخدام جذر القرص كمجلد بيانات مباشر');
    error.code = 'INVALID_DATA_DIRECTORY';
    throw error;
  }
  return { source, target };
}

function readDataMoveMarker(targetPath, pendingMove) {
  const markerName = pendingMove?.markerName;
  if (typeof markerName !== 'string' || !markerName.startsWith(DATA_LOCATION_MARKER_PREFIX)) return false;
  try {
    const marker = JSON.parse(fs.readFileSync(path.join(targetPath, markerName), 'utf8'));
    return marker?.id === pendingMove.id
      && comparableDataPath(marker.sourcePath) === comparableDataPath(pendingMove.sourcePath)
      && comparableDataPath(marker.targetPath) === comparableDataPath(targetPath);
  } catch {
    return false;
  }
}

function removeInterruptedDataMoveStages(parentPath, moveId) {
  const prefix = `.taj-mawadah-stage-${moveId}-`;
  for (const entry of fs.readdirSync(parentPath, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith(prefix)) continue;
    const stagePath = path.resolve(parentPath, entry.name);
    if (path.dirname(stagePath) === path.resolve(parentPath)) {
      fs.rmSync(stagePath, { recursive: true, force: true });
    }
  }
}

function copyUserDataToTarget(sourcePath, targetPath, pendingMove) {
  const { source, target } = assertSafeDataMovePaths(sourcePath, targetPath);
  const sourceStat = fs.statSync(source);
  if (!sourceStat.isDirectory()) {
    const error = new Error('مجلد البيانات الحالي غير موجود أو ليس مجلداً');
    error.code = 'SOURCE_DATA_DIRECTORY_UNAVAILABLE';
    throw error;
  }

  if (fs.existsSync(target) && readDataMoveMarker(target, pendingMove)) return;
  const targetParent = path.dirname(target);
  if (!fs.existsSync(targetParent) || !fs.statSync(targetParent).isDirectory()) {
    const error = new Error('مجلد القرص الذي يحتوي الوجهة غير متاح');
    error.code = 'TARGET_PARENT_UNAVAILABLE';
    throw error;
  }

  if (fs.existsSync(target)) {
    const targetStat = fs.lstatSync(target);
    if (!targetStat.isDirectory() || targetStat.isSymbolicLink() || fs.readdirSync(target).length > 0) {
      const error = new Error('مجلد الوجهة يحتوي على ملفات؛ اختر مجلداً فارغاً كي لا تُستبدل بيانات أخرى');
      error.code = 'TARGET_DATA_DIRECTORY_NOT_EMPTY';
      throw error;
    }
  }

  removeInterruptedDataMoveStages(targetParent, pendingMove.id);
  const stagePath = fs.mkdtempSync(path.join(targetParent, `.taj-mawadah-stage-${pendingMove.id}-`));
  let stageStillExists = true;
  try {
    fs.cpSync(source, stagePath, {
      recursive: true,
      force: false,
      errorOnExist: true,
      preserveTimestamps: true,
    });

    const marker = {
      id: pendingMove.id,
      sourcePath: source,
      targetPath: target,
    };
    fs.writeFileSync(
      path.join(stagePath, pendingMove.markerName),
      JSON.stringify(marker),
      { flag: 'wx' }
    );

    if (fs.existsSync(target)) {
      if (fs.readdirSync(target).length > 0) {
        const error = new Error('تغير محتوى مجلد الوجهة أثناء النقل؛ تم الإبقاء على البيانات الأصلية');
        error.code = 'TARGET_DATA_DIRECTORY_NOT_EMPTY';
        throw error;
      }
      fs.rmdirSync(target);
    }

    fs.renameSync(stagePath, target);
    stageStillExists = false;
  } finally {
    if (stageStillExists) {
      try { fs.rmSync(stagePath, { recursive: true, force: true }); } catch {}
    }
  }
}

function describeDataLocationError(error) {
  const code = error?.code;
  if (code === 'TARGET_DATA_DIRECTORY_NOT_EMPTY') {
    return 'مجلد الوجهة غير فارغ. اختر مجلداً فارغاً؛ لم تُستبدل أي بيانات.';
  }
  if (code === 'SAME_DATA_DIRECTORY') return 'هذا هو مجلد البيانات الحالي بالفعل.';
  if (code === 'NESTED_DATA_DIRECTORY') return 'اختر مجلداً مستقلاً خارج مجلد البيانات الحالي.';
  if (code === 'SOURCE_DATA_DIRECTORY_UNAVAILABLE') {
    return 'تعذر العثور على مجلد البيانات الحالي. أعد القرص أو المجلد الأصلي ثم أعد تشغيل التطبيق.';
  }
  if (code === 'TARGET_PARENT_UNAVAILABLE') {
    return 'القرص أو المجلد الأب للوجهة غير متاح. وصّل القرص واختر مجلداً موجوداً ثم أعد المحاولة.';
  }
  if (code === 'ENOSPC') return 'المساحة الحرة غير كافية لنسخ البيانات. أفرغ مساحة ثم أعد المحاولة.';
  if (code === 'EACCES' || code === 'EPERM') {
    return 'لا توجد صلاحية كافية للكتابة في الوجهة. اختر مجلداً تملك صلاحية الكتابة إليه.';
  }
  return 'تعذر نقل البيانات بأمان. بقيت البيانات الأصلية في مكانها؛ تحقق من القرص والصلاحيات ثم أعد المحاولة.';
}

function initializeElectronDataLocation() {
  const defaultDataDirectory = app.getPath('userData');
  let locationConfig;
  try {
    locationConfig = readDataLocationConfig();
  } catch (error) {
    console.error('تعذر قراءة إعداد موقع بيانات Electron؛ سيستخدم التطبيق المجلد الافتراضي:', error);
    dataLocationMigrationError = 'تعذر قراءة إعداد موقع البيانات؛ يستخدم التطبيق المجلد الافتراضي الحالي.';
    locationConfig = {};
  }

  let dataDirectory = defaultDataDirectory;
  if (typeof locationConfig.activePath === 'string' && path.isAbsolute(locationConfig.activePath)) {
    const configuredPath = path.resolve(locationConfig.activePath);
    try {
      if (fs.statSync(configuredPath).isDirectory()) dataDirectory = configuredPath;
    } catch {
      dataLocationMigrationError = 'مجلد البيانات المحفوظ غير متاح؛ يستخدم التطبيق مساره الافتراضي. أعد توصيل القرص أو استعد المجلد القديم.';
    }
  }

  const pendingMove = locationConfig.pendingMove;
  if (pendingMove && typeof pendingMove === 'object') {
    const source = dataDirectory;
    try {
      if (comparableDataPath(normalizeDataDirectory(pendingMove.sourcePath, 'مصدر النقل')) !== comparableDataPath(source)) {
        const error = new Error('مصدر النقل لا يطابق موقع البيانات النشط');
        error.code = 'SOURCE_DATA_DIRECTORY_UNAVAILABLE';
        throw error;
      }
      copyUserDataToTarget(source, pendingMove.targetPath, pendingMove);
      const target = path.resolve(pendingMove.targetPath);
      locationConfig = {
        ...locationConfig,
        activePath: target,
        pendingMove: null,
        lastMoveError: null,
      };
      writeDataLocationConfig(locationConfig);
      dataDirectory = target;
      dataLocationMigrationError = null;
      try { fs.rmSync(path.join(target, pendingMove.markerName), { force: true }); } catch {}
      console.info(`تم نقل مجلد بيانات Electron بنجاح إلى ${target}; بقي المجلد السابق محفوظاً`);
    } catch (error) {
      dataDirectory = source;
      dataLocationMigrationError = describeDataLocationError(error);
      locationConfig.lastMoveError = dataLocationMigrationError;
      try { writeDataLocationConfig(locationConfig); } catch (configError) {
        console.error('تعذر حفظ سبب تعثر نقل بيانات Electron:', configError);
      }
      console.error('تعذر نقل مجلد بيانات Electron؛ سيستمر التطبيق باستخدام المجلد الأصلي:', error);
    }
  } else if (!locationConfig.activePath) {
    locationConfig = { ...locationConfig, activePath: dataDirectory, lastMoveError: null };
    try { writeDataLocationConfig(locationConfig); } catch (error) {
      console.warn('تعذر حفظ موقع بيانات Electron الافتراضي:', error);
    }
  } else if (locationConfig.lastMoveError && !dataLocationMigrationError) {
    dataLocationMigrationError = String(locationConfig.lastMoveError);
  }

  activeDataDirectory = dataDirectory;
  try {
    fs.mkdirSync(dataDirectory, { recursive: true });
    app.setPath('userData', dataDirectory);
    app.setPath('sessionData', dataDirectory);
  } catch (error) {
    console.error('تعذر تعيين موقع بيانات Electron؛ سيستخدم التطبيق مساره الافتراضي:', error);
    dataLocationMigrationError = 'تعذر تهيئة مجلد البيانات المحدد. أعد توصيل القرص أو اختر مجلداً آخر.';
    activeDataDirectory = defaultDataDirectory;
  }
}

function migrateOfflineQueueToV1(database) {
  const existingQueue = database.prepare(
    "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'sync_queue'"
  ).get();
  const legacyRows = existingQueue
    ? database.prepare(`
        SELECT id, table_name, type, action, payload_json, status,
               retry_count, created_at, error_message
        FROM sync_queue
      `).all()
    : [];

  database.exec(`
    CREATE TABLE sync_queue_schema_v1 (
      id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) BETWEEN 1 AND 512),
      table_name TEXT NOT NULL CHECK (length(trim(table_name)) BETWEEN 1 AND 128),
      type TEXT NOT NULL CHECK (length(trim(type)) BETWEEN 1 AND 128),
      action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
      payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'syncing', 'failed')),
      retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
      created_at TEXT NOT NULL CHECK (length(trim(created_at)) > 0),
      error_message TEXT CHECK (error_message IS NULL OR length(error_message) <= 4000)
    );
  `);

  const insert = database.prepare(`
    INSERT INTO sync_queue_schema_v1
      (id, table_name, type, action, payload_json, status, retry_count, created_at, error_message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const row of legacyRows) {
    let payload;
    try {
      payload = JSON.parse(row.payload_json);
    } catch {
      throw new Error(`تعذر ترحيل العملية ${row.id}: بيانات الحمولة القديمة غير صالحة`);
    }

    const normalized = normalizeOfflineQueueItem({
      id: row.id,
      table: row.table_name,
      type: row.type,
      action: row.action,
      payload,
      status: row.status,
      retry_count: row.retry_count,
      created_at: row.created_at,
      error_message: row.error_message,
    });

    insert.run(
      normalized.id,
      normalized.table,
      normalized.type,
      normalized.action,
      normalized.payloadJson,
      normalized.status,
      normalized.retryCount,
      normalized.createdAt,
      normalized.errorMessage
    );
  }

  if (existingQueue) database.exec('DROP TABLE sync_queue');
  database.exec('ALTER TABLE sync_queue_schema_v1 RENAME TO sync_queue');
  database.exec(`
    CREATE INDEX idx_sync_queue_status_date
      ON sync_queue(status, created_at);
  `);
}

function migrateOfflineQueueSchema(database) {
  const versionRow = database.prepare('PRAGMA user_version').get();
  let version = Number(versionRow?.user_version ?? 0);

  if (!Number.isSafeInteger(version) || version < 0) {
    throw new Error('إصدار مخطط طابور المزامنة المحلي غير صالح');
  }
  if (version > OFFLINE_QUEUE_SCHEMA_VERSION) {
    throw new Error(
      `قاعدة طابور المزامنة أحدث من إصدار البرنامج (${version} > ${OFFLINE_QUEUE_SCHEMA_VERSION})`
    );
  }

  while (version < OFFLINE_QUEUE_SCHEMA_VERSION) {
    const nextVersion = version + 1;
    database.exec('BEGIN IMMEDIATE');
    try {
      if (nextVersion === 1) {
        migrateOfflineQueueToV1(database);
        database.exec('PRAGMA user_version = 1');
      } else {
        throw new Error(`لا يوجد ترحيل لمخطط طابور المزامنة إلى الإصدار ${nextVersion}`);
      }
      database.exec('COMMIT');
      version = nextVersion;
    } catch (error) {
      try { database.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }
}

function getOfflineQueueDb() {
  if (offlineQueueDb) return offlineQueueDb;

  const userDataDir = app.getPath('userData');
  fs.mkdirSync(userDataDir, { recursive: true });
  const database = new DatabaseSync(path.join(userDataDir, 'offline-sync.sqlite'));

  try {
    database.exec(`
      PRAGMA busy_timeout = 5000;
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
    `);
    migrateOfflineQueueSchema(database);

    // Recover work interrupted by an app or operating-system shutdown.
    database.prepare("UPDATE sync_queue SET status = 'pending' WHERE status = 'syncing'").run();
    offlineQueueDb = database;
    return offlineQueueDb;
  } catch (error) {
    try { database.close(); } catch {}
    throw error;
  }
}

function recoverOfflineQueueAfterRendererExit(webContents, lifecycleEvent) {
  if (quitting || !offlineQueueDb) return;

  try {
    const result = offlineQueueDb.prepare(
      "UPDATE sync_queue SET status = 'pending' WHERE status = 'syncing'"
    ).run();
    const recoveredCount = Number(result.changes);
    if (recoveredCount > 0) {
      console.info(`تمت استعادة ${recoveredCount} عملية متوقفة بعد ${lifecycleEvent}`);
      if (webContents && !webContents.isDestroyed()) {
        try {
          webContents.send('taj:sync-queue:renderer-recovered');
        } catch (error) {
          console.warn('تمت استعادة الطابور، لكن تعذر تنبيه renderer الجديد:', error);
        }
      }
    }
  } catch (error) {
    console.error(`تعذرت استعادة طابور المزامنة بعد ${lifecycleEvent}:`, error);
  }
}

const OFFLINE_QUEUE_ITEM_KEYS = [
  'id', 'table', 'type', 'action', 'payload', 'data', 'status',
  'retry_count', 'created_at', 'error_message',
];

function assertQueueRecord(value, allowedKeys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} غير صالحة`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} يجب أن تكون كائن بيانات بسيطًا`);
  }
  const unexpectedKey = Object.keys(value).find((key) => !allowedKeys.includes(key));
  if (unexpectedKey) throw new Error(`${label} تحتوي على حقل غير مسموح`);
  return value;
}

function validateQueueText(value, label, maxLength) {
  if (typeof value !== 'string') throw new Error(`${label} يجب أن يكون نصًا`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error(`${label} غير صالح أو تجاوز الحد المسموح`);
  }
  return normalized;
}

function validateQueueId(value) {
  return validateQueueText(value, 'معرف العملية', 512);
}

function assertNoQueueArguments(args) {
  if (args.length !== 0) throw new Error('هذه القناة لا تقبل معاملات إضافية');
}

function normalizeOfflineQueueItem(item) {
  assertQueueRecord(item, OFFLINE_QUEUE_ITEM_KEYS, 'بيانات عملية المزامنة');

  const id = validateQueueId(item.id);
  const table = validateQueueText(item.table, 'اسم الجدول', 128);
  const type = item.type == null || item.type === ''
    ? table
    : validateQueueText(item.type, 'نوع العملية', 128);
  const action = typeof item.action === 'string' ? item.action.trim().toUpperCase() : '';
  const payload = item.payload !== undefined ? item.payload : item.data;
  if (!['INSERT', 'UPDATE', 'DELETE'].includes(action) || payload === undefined) {
    throw new Error('عملية المزامنة ناقصة الأمر أو البيانات');
  }

  const payloadJson = JSON.stringify(payload);
  if (typeof payloadJson !== 'string') throw new Error('تعذر تحويل بيانات العملية إلى JSON');
  if (Buffer.byteLength(payloadJson, 'utf8') > 16 * 1024 * 1024) {
    throw new Error('حجم العملية أكبر من الحد المسموح للتخزين المحلي');
  }

  const status = item.status == null ? 'pending' : item.status;
  if (typeof status !== 'string' || !['pending', 'syncing', 'failed'].includes(status)) {
    throw new Error('حالة مزامنة غير صالحة');
  }

  const retryCount = item.retry_count == null ? 0 : item.retry_count;
  if (!Number.isSafeInteger(retryCount) || retryCount < 0) {
    throw new Error('عداد محاولات المزامنة غير صالح');
  }

  const createdAt = item.created_at == null
    ? new Date().toISOString()
    : validateQueueText(item.created_at, 'تاريخ إنشاء العملية', 64);
  if (item.error_message != null && typeof item.error_message !== 'string') {
    throw new Error('رسالة خطأ المزامنة يجب أن تكون نصًا');
  }

  return {
    id,
    table,
    type,
    action,
    payloadJson,
    status,
    retryCount,
    createdAt,
    errorMessage: item.error_message ? item.error_message.slice(0, 4000) : null,
  };
}

function assertTrustedQueueRenderer(event) {
  const sender = event?.sender;
  const senderFrame = event?.senderFrame;
  if (!win || win.isDestroyed() || !sender || sender !== win.webContents || sender.isDestroyed()) {
    throw new Error('مصدر طلب الطابور غير مسموح');
  }
  if (!senderFrame || senderFrame.parent !== null || senderFrame.url !== sender.mainFrame?.url) {
    throw new Error('طلبات الطابور مسموحة من الصفحة الرئيسية فقط');
  }

  const expectedUrl = resolveAppUrl();
  if (!expectedUrl || !senderFrame.url) throw new Error('مصدر طلب الطابور غير معروف');

  let expected;
  let actual;
  try {
    expected = new URL(expectedUrl);
    actual = new URL(senderFrame.url);
  } catch {
    throw new Error('مصدر طلب الطابور غير صالح');
  }

  if (!['http:', 'https:'].includes(expected.protocol) || expected.origin === 'null') {
    throw new Error('رابط التطبيق لا يسمح باستخدام طابور المزامنة المحلي');
  }
  if (expected.origin !== actual.origin) {
    throw new Error('غير مسموح لمصدر الصفحة باستخدام طابور المزامنة المحلي');
  }
}

function readConfig() {
  try { return JSON.parse(fs.readFileSync(configPath(), 'utf8')); } catch { return {}; }
}
function writeConfig(patch) {
  const next = { ...readConfig(), ...patch };
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(next, null, 2));
  return next;
}

function resolveAppUrl() {
  if (process.env.TAJ_APP_URL) return process.env.TAJ_APP_URL;
  const cfg = readConfig();
  if (cfg.appUrl) return cfg.appUrl;
  return isDev ? DEV_URL : null;
}

let win = null;
let tray = null;
let quitting = false;

// نسخة واحدة فقط لكل جهاز كمبيوتر
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1366,
    height: 820,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: '#FDFBF7',
    title: 'تاج المودة — ERP & POS Desktop',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // مطلوب لتمكين الـ Preload من IPC الموسّع
      webSecurity: true,
    },
  });

  const queueRendererContents = win.webContents;
  // did-navigate fires after the previous main-frame document has been replaced.
  queueRendererContents.on('did-navigate', () => {
    recoverOfflineQueueAfterRendererExit(queueRendererContents, 'إعادة تحميل الصفحة');
  });
  // A crashed renderer has exited, so no previous queue processor can still be running.
  queueRendererContents.on('render-process-gone', () => {
    recoverOfflineQueueAfterRendererExit(queueRendererContents, 'توقف عملية العرض');
  });

  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
  });

  // الروابط الخارجية تفتح في متصفح النظام
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });

  loadApp();
}

function loadApp() {
  const url = resolveAppUrl();
  if (!url) {
    win.loadFile(path.join(__dirname, 'setup.html'));
    return;
  }
  win.loadURL(url).catch(() => {
    win.loadFile(path.join(__dirname, 'setup.html'), { query: { error: '1', url } });
  });
}

function createTray() {
  const iconPath = path.join(__dirname, '..', 'public', 'taj_logo.png');
  let icon = nativeImage.createFromPath(iconPath);
  if (!icon.isEmpty()) icon = icon.resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('تاج المودة — ERP & POS Desktop');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'فتح البرنامج', click: () => { win.show(); win.focus(); } },
      { label: 'إعادة تحميل', click: () => loadApp() },
      { type: 'separator' },
      {
        label: 'التشغيل التلقائي مع ويندوز',
        type: 'checkbox',
        checked: app.getLoginItemSettings().openAtLogin,
        click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
      },
      { type: 'separator' },
      { label: 'خروج نهائي', click: () => { quitting = true; app.quit(); } },
    ])
  );
  tray.on('double-click', () => { win.show(); win.focus(); });
}

// --------------------------------------------------------------------------
// 🛠️ محرك العتاد والشبكات المدمج داخل Electron (Hardware & Network Engine)
// --------------------------------------------------------------------------

const runCmd = (cmd, timeout = 3500) =>
  new Promise((resolve) => exec(cmd, { timeout }, (err, stdout) => resolve(err ? '' : String(stdout))));

function subnetRange(ip, mask) {
  try {
    const i = ip.split('.').map(Number);
    const m = (mask || '255.255.255.0').split('.').map(Number);
    const net4 = i.map((p, k) => p & m[k]);
    const br = i.map((p, k) => p | (~m[k] & 255));
    const start = Math.max(1, net4[3] + 1);
    const end = Math.min(254, br[3] - 1);
    return start <= end ? { startHost: start, endHost: end } : { startHost: 1, endHost: 30 };
  } catch {
    return { startHost: 1, endHost: 30 };
  }
}

const typeOf = (name) => {
  const n = name.toLowerCase();
  if (/wi-?fi|wlan|wireless|wl/i.test(n)) return 'wifi';
  return 'ethernet';
};

async function parseGateways() {
  const map = {};
  if (isWin) {
    const out = await runCmd('ipconfig');
    let cur = null;
    for (const line of out.split(/\r?\n/)) {
      const h = line.match(/^(?:Ethernet adapter|Wireless LAN adapter)\s+(.+?):$/i);
      if (h) { cur = h[1].trim(); continue; }
      const g = line.match(/Default Gateway[.\s]+:\s*([0-9.]+)/i);
      if (cur && g && g[1] !== '0.0.0.0') map[cur] = g[1];
    }
  } else {
    const out = await runCmd('ip route');
    for (const line of out.split('\n')) {
      const m = line.match(/^default via ([0-9.]+) dev (\S+)/);
      if (m) map[m[2]] = m[1];
    }
  }
  return map;
}

async function detectSystemNetwork() {
  const gws = await parseGateways();
  const ifaces = os.networkInterfaces();
  const adapters = [];

  for (const [name, addrs] of Object.entries(ifaces)) {
    if (/bluetooth|loopback|virtual|vethernet|vmware|vbox|\*/i.test(name)) continue;
    const v4 = (addrs || []).find((a) => a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.'));
    const type = typeOf(name);
    const base = {
      id: `${type}-${name}`,
      type,
      name,
      displayName: type === 'wifi' ? 'كرت الواي فاي اللاسلكي (Wi-Fi)' : 'كرت الشبكة السلكية (Ethernet LAN)',
    };

    if (v4) {
      const p = v4.address.split('.');
      const prefix = `${p[0]}.${p[1]}.${p[2]}`;
      const gw = gws[name] || null;
      const range = subnetRange(v4.address, v4.netmask);
      adapters.push({
        ...base,
        status: 'connected',
        ip: v4.address,
        netmask: v4.netmask,
        gateway: gw,
        subnetPrefix: prefix,
        gatewaySubnet: gw ? gw.split('.').slice(0, 3).join('.') : prefix,
        startHost: range.startHost,
        endHost: range.endHost,
        currentHost: Number(p[3]),
      });
    } else {
      adapters.push({
        ...base,
        status: 'disconnected',
        ip: null,
        netmask: null,
        gateway: null,
      });
    }
  }

  // ضمان إبراز كرت الإيثرنت وكرت الواي فاي دائماً في اللوحة
  for (const t of ['ethernet', 'wifi']) {
    if (!adapters.some((a) => a.type === t)) {
      adapters.push({
        id: t,
        type: t,
        name: t === 'wifi' ? 'Wi-Fi' : 'Ethernet',
        displayName: t === 'wifi' ? 'كرت الواي فاي اللاسلكي (Wi-Fi)' : 'كرت الشبكة السلكية (Ethernet LAN)',
        status: 'disconnected',
        ip: null,
        netmask: null,
        gateway: null,
      });
    }
  }

  adapters.sort((a) => (a.type === 'ethernet' ? -1 : 1));
  const primary = adapters.find((a) => a.status === 'connected') || adapters[0];

  return {
    success: true,
    isDesktopNative: true,
    adapters,
    primary: primary && primary.ip ? primary : null,
    all: adapters.filter((a) => a.ip),
  };
}

function nativePing(ip, ms = 600) {
  const cmd = isWin ? `ping -n 1 -w ${ms} ${ip}` : `ping -c 1 -W ${Math.ceil(ms / 1000)} ${ip}`;
  const t = Date.now();
  return runCmd(cmd, ms + 400).then((out) => ({
    alive: /ttl=/i.test(out) && !/unreachable|timed out|could not find/i.test(out),
    latency: Date.now() - t,
  }));
}

function nativeTcp(ip, port, ms = 800) {
  return new Promise((resolve) => {
    const t = Date.now();
    const s = new net.Socket();
    s.setTimeout(ms);
    s.connect(port, ip, () => {
      s.destroy();
      resolve({ open: true, latency: Date.now() - t });
    });
    s.on('error', (err) => {
      s.destroy();
      resolve({ open: false, latency: Date.now() - t, error: err.code || err.message });
    });
    s.on('timeout', () => {
      s.destroy();
      resolve({ open: false, latency: Date.now() - t, error: 'TIMEOUT' });
    });
  });
}

// إرسال أوامر ESC/POS وطباعة خام مباشرة عبر منفذ الشبكة (Port 9100 RAW)
function nativeRawPrint(ip, port = 9100, bufferData) {
  return new Promise((resolve, reject) => {
    const s = new net.Socket();
    s.setTimeout(4000);
    s.connect(port, ip, () => {
      const data = Buffer.isBuffer(bufferData) ? bufferData : Buffer.from(bufferData);
      s.write(data, () => {
        s.end();
        resolve({ success: true, message: `تم إرسال أمر الطباعة بنجاح إلى ${ip}:${port}` });
      });
    });
    s.on('error', (err) => {
      s.destroy();
      reject(new Error(`فشل الاتصال بالطابعة على ${ip}:${port} (${err.message})`));
    });
    s.on('timeout', () => {
      s.destroy();
      reject(new Error(`انتهت مهلة الاتصال بالطابعة على ${ip}:${port}`));
    });
  });
}

// --------------------------------------------------------------------------
// 📡 قنوات IPC المتاحة لـ Web App عبر window.tajDesktop
// --------------------------------------------------------------------------

ipcMain.handle('taj:get-info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  userData: app.getPath('userData'),
  appUrl: resolveAppUrl(),
  isDesktop: true,
}));

// Durable offline Outbox stored in SQLite under Electron's userData directory.
ipcMain.handle('taj:sync-queue:add', (event, item, ...extraArgs) => {
  assertTrustedQueueRenderer(event);
  assertNoQueueArguments(extraArgs);
  const normalized = normalizeOfflineQueueItem(item);
  const database = getOfflineQueueDb();
  const insertResult = database.prepare(`
    INSERT OR IGNORE INTO sync_queue
      (id, table_name, type, action, payload_json, status, retry_count, created_at, error_message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    normalized.id,
    normalized.table,
    normalized.type,
    normalized.action,
    normalized.payloadJson,
    normalized.status,
    normalized.retryCount,
    normalized.createdAt,
    normalized.errorMessage
  );

  if (Number(insertResult.changes) === 0) {
    const existing = database.prepare(`
      SELECT table_name, type, action, payload_json
      FROM sync_queue
      WHERE id = ?
    `).get(normalized.id);
    const sameOperation = existing
      && existing.table_name === normalized.table
      && existing.type === normalized.type
      && existing.action === normalized.action
      && existing.payload_json === normalized.payloadJson;

    if (!sameOperation) return { success: false };
  }

  return { success: true, id: normalized.id };
});

ipcMain.handle('taj:sync-queue:list-pending', (event, ...args) => {
  assertTrustedQueueRenderer(event);
  assertNoQueueArguments(args);
  const rows = getOfflineQueueDb().prepare(`
    SELECT id, table_name, type, action, payload_json, status,
           retry_count, created_at, error_message
    FROM sync_queue
    WHERE status IN ('pending', 'failed')
    ORDER BY created_at ASC
  `).all();
  return rows.map((row) => {
    const payload = JSON.parse(row.payload_json);
    return {
      id: row.id,
      table: row.table_name,
      type: row.type,
      action: row.action,
      payload,
      data: payload,
      status: row.status,
      retry_count: row.retry_count,
      created_at: row.created_at,
      error_message: row.error_message || undefined,
    };
  });
});

ipcMain.handle('taj:sync-queue:count-pending', (event, ...args) => {
  assertTrustedQueueRenderer(event);
  assertNoQueueArguments(args);
  const row = getOfflineQueueDb().prepare(
    "SELECT COUNT(*) AS count FROM sync_queue WHERE status IN ('pending', 'failed')"
  ).get();
  return Number(row?.count || 0);
});

// Read-only aggregate used by the Settings diagnostics panel. Queue payloads and
// SQL access remain private to the main process.
ipcMain.handle('taj:sync-queue:diagnostics', (event, ...args) => {
  assertTrustedQueueRenderer(event);
  assertNoQueueArguments(args);
  const row = getOfflineQueueDb().prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status = 'syncing' THEN 1 ELSE 0 END) AS syncing,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
      MIN(CASE WHEN status = 'pending' THEN created_at END) AS oldest_pending_at,
      MIN(CASE WHEN status = 'syncing' THEN created_at END) AS oldest_syncing_at,
      MAX(CASE WHEN status = 'failed' THEN retry_count ELSE 0 END) AS max_failed_retries,
      SUM(CASE WHEN status = 'failed' AND (
        lower(COALESCE(error_message, '')) LIKE '%permission%'
        OR lower(COALESCE(error_message, '')) LIKE '%42501%'
        OR lower(COALESCE(error_message, '')) LIKE '%row-level security%'
      ) THEN 1 ELSE 0 END) AS permission_errors,
      SUM(CASE WHEN status = 'failed' AND (
        lower(COALESCE(error_message, '')) LIKE '%pgrst202%'
        OR lower(COALESCE(error_message, '')) LIKE '%schema cache%'
        OR lower(COALESCE(error_message, '')) LIKE '%function%not found%'
      ) THEN 1 ELSE 0 END) AS rpc_errors,
      SUM(CASE WHEN status = 'failed' AND (
        lower(COALESCE(error_message, '')) LIKE '%fetch%'
        OR lower(COALESCE(error_message, '')) LIKE '%network%'
        OR lower(COALESCE(error_message, '')) LIKE '%timeout%'
        OR lower(COALESCE(error_message, '')) LIKE '%connection%'
      ) THEN 1 ELSE 0 END) AS network_errors,
      SUM(CASE WHEN status = 'failed' AND (
        lower(COALESCE(error_message, '')) LIKE '%23514%'
        OR lower(COALESCE(error_message, '')) LIKE '%constraint%'
        OR lower(COALESCE(error_message, '')) LIKE '%invalid%'
        OR lower(COALESCE(error_message, '')) LIKE '%غير صالح%'
      ) THEN 1 ELSE 0 END) AS validation_errors
    FROM sync_queue
  `).get();

  return {
    success: true,
    total: Number(row?.total || 0),
    pending: Number(row?.pending || 0),
    syncing: Number(row?.syncing || 0),
    failed: Number(row?.failed || 0),
    oldestPendingAt: row?.oldest_pending_at || undefined,
    oldestSyncingAt: row?.oldest_syncing_at || undefined,
    maxFailedRetries: Number(row?.max_failed_retries || 0),
    errorCategories: {
      permission: Number(row?.permission_errors || 0),
      rpc: Number(row?.rpc_errors || 0),
      network: Number(row?.network_errors || 0),
      validation: Number(row?.validation_errors || 0),
    },
  };
});

ipcMain.handle('taj:sync-queue:set-status', (event, params, ...extraArgs) => {
  assertTrustedQueueRenderer(event);
  assertNoQueueArguments(extraArgs);
  const { id, status } = assertQueueRecord(params, ['id', 'status'], 'طلب تحديث حالة العملية');
  const safeId = validateQueueId(id);
  if (typeof status !== 'string' || !['pending', 'syncing'].includes(status)) {
    throw new Error('حالة مزامنة غير صالحة');
  }
  const result = getOfflineQueueDb().prepare(
    'UPDATE sync_queue SET status = ?, error_message = NULL WHERE id = ?'
  ).run(status, safeId);
  return { success: Number(result.changes) > 0 };
});

ipcMain.handle('taj:sync-queue:mark-failed', (event, params, ...extraArgs) => {
  assertTrustedQueueRenderer(event);
  assertNoQueueArguments(extraArgs);
  const { id, errorMessage } = assertQueueRecord(
    params,
    ['id', 'errorMessage'],
    'طلب تسجيل فشل العملية'
  );
  const safeId = validateQueueId(id);
  if (errorMessage != null && typeof errorMessage !== 'string') {
    throw new Error('رسالة خطأ المزامنة يجب أن تكون نصًا');
  }
  const safeErrorMessage = (errorMessage || 'فشل الاتصال بالخادم').slice(0, 4000);
  const result = getOfflineQueueDb().prepare(`
    UPDATE sync_queue
    SET status = 'failed', retry_count = retry_count + 1, error_message = ?
    WHERE id = ?
  `).run(safeErrorMessage, safeId);
  return { success: Number(result.changes) > 0 };
});

ipcMain.handle('taj:sync-queue:remove', (event, id, ...extraArgs) => {
  assertTrustedQueueRenderer(event);
  assertNoQueueArguments(extraArgs);
  const safeId = validateQueueId(id);
  const result = getOfflineQueueDb().prepare('DELETE FROM sync_queue WHERE id = ?').run(safeId);
  return { success: Number(result.changes) > 0 };
});

ipcMain.handle('taj:sync-queue:clear', (event, ...args) => {
  assertTrustedQueueRenderer(event);
  assertNoQueueArguments(args);
  getOfflineQueueDb().prepare('DELETE FROM sync_queue').run();
  return { success: true };
});

ipcMain.handle('taj:set-app-url', (_e, url) => {
  const clean = String(url || '').trim();
  if (!/^https?:\/\/[^\s]+$/i.test(clean)) return { ok: false, error: 'رابط غير صالح' };
  writeConfig({ appUrl: clean.replace(/\/+$/, '') });
  loadApp();
  return { ok: true };
});

ipcMain.handle('taj:detect-network', async () => {
  try {
    return await detectSystemNetwork();
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('taj:ping', async (_e, { ip, port, timeoutMs }) => {
  try {
    const icmp = await nativePing(ip, timeoutMs || 700);
    const targetPort = port ? Number(port) : undefined;
    let t = { open: false, latency: 0, error: undefined };
    if (targetPort) {
      t = await nativeTcp(ip, targetPort, (timeoutMs || 700) + 200);
    }
    const reachable = icmp.alive || t.open;
    const latency = t.open ? t.latency : icmp.latency;
    let message = 'الجهاز غير متاح على الشبكة أو مفصول';
    if (t.open) message = `الجهاز متصل والمنفذ ${targetPort} مفتوح وجاهز للعمل (${latency}ms) 🟢`;
    else if (icmp.alive) message = targetPort ? `الجهاز متصل (Ping OK) لكن المنفذ ${targetPort} مغلق 🟡` : `الجهاز متصل ومستجيب (${latency}ms) 🟢`;

    return {
      success: true,
      reachable,
      hostAlive: icmp.alive,
      portOpen: t.open,
      latency,
      message,
    };
  } catch (err) {
    return { success: false, reachable: false, error: err.message };
  }
});

ipcMain.handle('taj:scan-subnet', async (_e, { subnetPrefix, startHost, endHost, port }) => {
  try {
    const prefix = subnetPrefix || '192.168.1';
    const s = Math.max(1, Number(startHost) || 1);
    const e = Math.min(254, Number(endHost) || 30);
    const p = Number(port) || 9100;
    const hosts = [];
    for (let h = s; h <= e; h++) hosts.push(h);

    const discovered = [];
    for (let i = 0; i < hosts.length; i += 10) {
      await Promise.all(
        hosts.slice(i, i + 10).map(async (h) => {
          const ip = `${prefix}.${h}`;
          const icmp = await nativePing(ip, 500);
          const t = await nativeTcp(ip, p, 600);
          if (icmp.alive || t.open) {
            discovered.push({
              ip,
              port: p,
              hostAlive: icmp.alive,
              portOpen: t.open,
              latency: t.open ? t.latency : icmp.latency,
            });
          }
        })
      );
    }
    return { success: true, scannedCount: hosts.length, discovered };
  } catch (err) {
    return { success: false, error: err.message, discovered: [] };
  }
});

ipcMain.handle('taj:print-raw', async (_e, { ip, port, data }) => {
  try {
    return await nativeRawPrint(ip, port || 9100, data);
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('taj:kick-drawer', async (_e, { ip, port }) => {
  try {
    // أمر فتح الدرج القياسي ESC p 0 25 250
    const kickCmd = Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA]);
    return await nativeRawPrint(ip, port || 9100, kickCmd);
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// إدارة النسخ الاحتياطي في الذاكرة الدائمة المحلية (Offline Backup Storage)
ipcMain.handle('taj:backup-export', async (_e, { fileName, payload }) => {
  try {
    const backupDir = path.join(app.getPath('userData'), 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const name = fileName || `TajPOS_Backup_${new Date().toISOString().replace(/[:.]/g, '-')}.tajbak`;
    const fullPath = path.join(backupDir, name);
    fs.writeFileSync(fullPath, JSON.stringify(payload, null, 2), 'utf8');
    return { success: true, filePath: fullPath, fileName: name };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('taj:backup-list', async () => {
  try {
    const backupDir = path.join(app.getPath('userData'), 'backups');
    if (!fs.existsSync(backupDir)) return { success: true, files: [] };
    const files = fs.readdirSync(backupDir).map((f) => {
      const stat = fs.statSync(path.join(backupDir, f));
      return { name: f, size: stat.size, date: stat.mtime };
    });
    return { success: true, files };
  } catch (err) {
    return { success: false, error: err.message, files: [] };
  }
});

app.whenReady().then(() => {
  try {
    getOfflineQueueDb();
  } catch (err) {
    console.error('تعذر تهيئة طابور المزامنة المحلي SQLite:', err);
  }
  createWindow();
  createTray();
});

app.on('before-quit', () => {
  quitting = true;
  if (offlineQueueDb) {
    try {
      offlineQueueDb.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      offlineQueueDb.close();
    } catch (err) {
      console.warn('تعذر إغلاق قاعدة طابور المزامنة بشكل نظيف:', err);
    }
  }
});
app.on('window-all-closed', () => { /* يبقى في Tray */ });
