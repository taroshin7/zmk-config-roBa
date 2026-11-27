/*
 * roBa：接続先に合わせてキーマップを切り替える
 *
 * スマホを登録した Bluetooth プロファイルにつながっているときだけ、
 * スマホ用レイヤーをオンにする。PC（別のプロファイル、または USB）のときはオフ。
 * &to 0 などでレイヤーがすべて切られても、スマホ接続中ならすぐ元に戻す。
 *
 * SPDX-License-Identifier: MIT
 */

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>

#include <zmk/endpoints.h>
#include <zmk/event_manager.h>
#include <zmk/events/endpoint_changed.h>
#include <zmk/events/ble_active_profile_changed.h>
#include <zmk/events/layer_state_changed.h>
#include <zmk/keymap.h>

LOG_MODULE_DECLARE(zmk, CONFIG_ZMK_LOG_LEVEL);

#define PHONE_PROFILE CONFIG_ROBA_HOST_LAYER_PHONE_PROFILE
#define PHONE_LAYER CONFIG_ROBA_HOST_LAYER_PHONE_LAYER

static bool is_phone(struct zmk_endpoint_instance ep) {
    return ep.transport == ZMK_TRANSPORT_BLE && ep.ble.profile_index == PHONE_PROFILE;
}

static void sync_layer(struct k_work *work) {
    bool want = is_phone(zmk_endpoints_selected());
    bool have = zmk_keymap_layer_active(PHONE_LAYER);
    if (want && !have) {
        LOG_INF("host-layer: phone connected, enabling layer %d", PHONE_LAYER);
        zmk_keymap_layer_activate(PHONE_LAYER);
    } else if (!want && have) {
        LOG_INF("host-layer: PC connected, disabling layer %d", PHONE_LAYER);
        zmk_keymap_layer_deactivate(PHONE_LAYER);
    }
}

static K_WORK_DEFINE(sync_work, sync_layer);
static K_WORK_DELAYABLE_DEFINE(boot_sync_work, sync_layer);

static int host_layer_listener(const zmk_event_t *eh) {
    if (as_zmk_endpoint_changed(eh) || as_zmk_ble_active_profile_changed(eh)) {
        k_work_submit(&sync_work);
        return ZMK_EV_EVENT_BUBBLE;
    }
    const struct zmk_layer_state_changed *ls = as_zmk_layer_state_changed(eh);
    if (ls && ls->layer == PHONE_LAYER && !ls->state) {
        // &to 0 などで切られたとき、スマホ接続中なら戻す
        k_work_submit(&sync_work);
    }
    return ZMK_EV_EVENT_BUBBLE;
}

ZMK_LISTENER(roba_host_layer, host_layer_listener);
ZMK_SUBSCRIPTION(roba_host_layer, zmk_endpoint_changed);
ZMK_SUBSCRIPTION(roba_host_layer, zmk_layer_state_changed);
ZMK_SUBSCRIPTION(roba_host_layer, zmk_ble_active_profile_changed);
// 起動直後は接続先の初期値がイベントなしで決まることがあるので、少し待ってから一度合わせる
static int host_layer_init(void) {
    k_work_schedule(&boot_sync_work, K_SECONDS(3));
    return 0;
}

SYS_INIT(host_layer_init, APPLICATION, CONFIG_APPLICATION_INIT_PRIORITY);
