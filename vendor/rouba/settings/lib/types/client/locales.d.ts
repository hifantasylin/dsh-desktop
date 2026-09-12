/**
 * Dictionaries for the settings section. The plugin follows the browser's
 * language preference through `navigator.language`: the two dictionaries are
 * keyed identically and `t()` picks one, falling back to English for any
 * language the pair does not cover.
 *
 * Deliberately dependency-free — no locale service, no registration order to
 * get right — so a deployment that needs a third language swaps this module,
 * not the section.
 * @module @roubaai/settings/client/locales
 */
/** The dictionary key union: both languages carry exactly these keys. */
declare const zh: {
    readonly intro: "配置图片 / 视频 / 音乐生成服务的提供方。API Key 只写入、不回显。";
    readonly categoryImage: "图片";
    readonly categoryVideo: "视频";
    readonly categoryMusic: "音乐";
    readonly defaultProviderName: "默认";
    readonly customBadge: "自定义";
    readonly activeLabel: "使用中";
    readonly useAction: "使用";
    readonly editAction: "编辑";
    readonly deleteAction: "删除";
    readonly addProvider: "添加自定义提供方";
    readonly apiKeyTitle: "API Key";
    readonly apiKeyDesc: "保存后不再显示";
    readonly apiKeySaved: "已保存，留空表示不修改";
    readonly apiKeyUnset: "尚未设置";
    readonly adapterTitle: "适配器";
    readonly adapterHint: "由哪个已安装的后端处理这一行。可选值来自本次部署实际挂载的插件。";
    readonly baseUrlTitle: "接口地址";
    readonly baseUrlReadonly: "内置默认端点，不可修改。";
    readonly getApiKey: "获取专属 API Key";
    readonly modelTitle: "模型";
    readonly modelReadonly: "内置默认模型，不可修改";
    readonly nameTitle: "名称";
    readonly namePlaceholder: "提供方名称";
    readonly cancel: "取消";
    readonly save: "保存";
    readonly saving: "保存中…";
    readonly test: "测试连接";
    readonly testing: "测试中…";
    readonly saveFailed: "保存失败：";
    readonly testFailed: "测试失败：";
    readonly conflict: "配置已被其他端修改，请刷新后重试。";
    readonly untitledProvider: "未命名提供方";
};
type MessageKey = keyof typeof zh;
/**
 * Look up one message in the active language.
 * @param key - the dictionary key.
 * @returns the localized string.
 */
export declare function t(key: MessageKey): string;
export {};
//# sourceMappingURL=locales.d.ts.map