use tauri::AppHandle;

pub fn spawn_input_monitor(app: AppHandle) {
    #[cfg(windows)]
    windows::spawn(app);

    #[cfg(not(windows))]
    {
        let _ = app;
    }
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct InputActivity {
    kind: &'static str,
    code: Option<&'static str>,
    label: Option<&'static str>,
}

#[cfg(windows)]
mod windows {
    use std::{
        thread,
        time::{Duration, Instant},
    };

    use tauri::{AppHandle, Emitter};
    use windows_sys::Win32::{
        Foundation::POINT,
        UI::{Input::KeyboardAndMouse::GetAsyncKeyState, WindowsAndMessaging::GetCursorPos},
    };

    use super::InputActivity;

    const POLL_INTERVAL: Duration = Duration::from_millis(60);
    const MOUSE_EMIT_INTERVAL: Duration = Duration::from_millis(90);
    const MOUSE_MOVE_THRESHOLD: i32 = 2;

    struct KeySpec {
        vkey: i32,
        code: &'static str,
        label: &'static str,
    }

    pub fn spawn(app: AppHandle) {
        if let Err(error) = thread::Builder::new()
            .name("koda-input-monitor".to_string())
            .spawn(move || poll_input(app))
        {
            eprintln!("[koda-desk] failed to start input monitor: {error}");
        }
    }

    fn poll_input(app: AppHandle) {
        let mut pressed = [false; 256];
        let mut last_cursor = cursor_position();
        let mut last_mouse_emit = Instant::now() - MOUSE_EMIT_INTERVAL;

        loop {
            for key in watched_keys() {
                let index = key.vkey as usize;
                let is_down = is_key_down(key.vkey);

                if is_down && !pressed[index] {
                    emit_activity(
                        &app,
                        InputActivity {
                            kind: "keyboard",
                            code: Some(key.code),
                            label: Some(key.label),
                        },
                    );
                }

                pressed[index] = is_down;
            }

            if let Some(cursor) = cursor_position() {
                if let Some(previous) = last_cursor {
                    let distance = (cursor.0 - previous.0).abs() + (cursor.1 - previous.1).abs();

                    if distance >= MOUSE_MOVE_THRESHOLD
                        && last_mouse_emit.elapsed() >= MOUSE_EMIT_INTERVAL
                    {
                        emit_activity(
                            &app,
                            InputActivity {
                                kind: "mouse",
                                code: None,
                                label: None,
                            },
                        );
                        last_mouse_emit = Instant::now();
                    }
                }

                last_cursor = Some(cursor);
            }

            thread::sleep(POLL_INTERVAL);
        }
    }

    fn is_key_down(vkey: i32) -> bool {
        unsafe { (GetAsyncKeyState(vkey) as u16 & 0x8000) != 0 }
    }

    fn cursor_position() -> Option<(i32, i32)> {
        let mut point = POINT::default();
        let ok = unsafe { GetCursorPos(&mut point) };

        if ok == 0 {
            None
        } else {
            Some((point.x, point.y))
        }
    }

    fn emit_activity(app: &AppHandle, activity: InputActivity) {
        if let Err(error) = app.emit("input:activity", activity) {
            eprintln!("[koda-desk] failed to emit input activity: {error}");
        }
    }

    fn watched_keys() -> &'static [KeySpec] {
        &[
            KeySpec {
                vkey: 0x41,
                code: "KeyA",
                label: "A",
            },
            KeySpec {
                vkey: 0x42,
                code: "KeyB",
                label: "B",
            },
            KeySpec {
                vkey: 0x43,
                code: "KeyC",
                label: "C",
            },
            KeySpec {
                vkey: 0x44,
                code: "KeyD",
                label: "D",
            },
            KeySpec {
                vkey: 0x45,
                code: "KeyE",
                label: "E",
            },
            KeySpec {
                vkey: 0x46,
                code: "KeyF",
                label: "F",
            },
            KeySpec {
                vkey: 0x47,
                code: "KeyG",
                label: "G",
            },
            KeySpec {
                vkey: 0x48,
                code: "KeyH",
                label: "H",
            },
            KeySpec {
                vkey: 0x49,
                code: "KeyI",
                label: "I",
            },
            KeySpec {
                vkey: 0x4A,
                code: "KeyJ",
                label: "J",
            },
            KeySpec {
                vkey: 0x4B,
                code: "KeyK",
                label: "K",
            },
            KeySpec {
                vkey: 0x4C,
                code: "KeyL",
                label: "L",
            },
            KeySpec {
                vkey: 0x4D,
                code: "KeyM",
                label: "M",
            },
            KeySpec {
                vkey: 0x4E,
                code: "KeyN",
                label: "N",
            },
            KeySpec {
                vkey: 0x4F,
                code: "KeyO",
                label: "O",
            },
            KeySpec {
                vkey: 0x50,
                code: "KeyP",
                label: "P",
            },
            KeySpec {
                vkey: 0x51,
                code: "KeyQ",
                label: "Q",
            },
            KeySpec {
                vkey: 0x52,
                code: "KeyR",
                label: "R",
            },
            KeySpec {
                vkey: 0x53,
                code: "KeyS",
                label: "S",
            },
            KeySpec {
                vkey: 0x54,
                code: "KeyT",
                label: "T",
            },
            KeySpec {
                vkey: 0x55,
                code: "KeyU",
                label: "U",
            },
            KeySpec {
                vkey: 0x56,
                code: "KeyV",
                label: "V",
            },
            KeySpec {
                vkey: 0x57,
                code: "KeyW",
                label: "W",
            },
            KeySpec {
                vkey: 0x58,
                code: "KeyX",
                label: "X",
            },
            KeySpec {
                vkey: 0x59,
                code: "KeyY",
                label: "Y",
            },
            KeySpec {
                vkey: 0x5A,
                code: "KeyZ",
                label: "Z",
            },
            KeySpec {
                vkey: 0x30,
                code: "Digit0",
                label: "0",
            },
            KeySpec {
                vkey: 0x31,
                code: "Digit1",
                label: "1",
            },
            KeySpec {
                vkey: 0x32,
                code: "Digit2",
                label: "2",
            },
            KeySpec {
                vkey: 0x33,
                code: "Digit3",
                label: "3",
            },
            KeySpec {
                vkey: 0x34,
                code: "Digit4",
                label: "4",
            },
            KeySpec {
                vkey: 0x35,
                code: "Digit5",
                label: "5",
            },
            KeySpec {
                vkey: 0x36,
                code: "Digit6",
                label: "6",
            },
            KeySpec {
                vkey: 0x37,
                code: "Digit7",
                label: "7",
            },
            KeySpec {
                vkey: 0x38,
                code: "Digit8",
                label: "8",
            },
            KeySpec {
                vkey: 0x39,
                code: "Digit9",
                label: "9",
            },
            KeySpec {
                vkey: 0x20,
                code: "Space",
                label: "Space",
            },
            KeySpec {
                vkey: 0x0D,
                code: "Enter",
                label: "Enter",
            },
            KeySpec {
                vkey: 0x08,
                code: "Backspace",
                label: "Back",
            },
            KeySpec {
                vkey: 0x25,
                code: "ArrowLeft",
                label: "Left",
            },
            KeySpec {
                vkey: 0x26,
                code: "ArrowUp",
                label: "Up",
            },
            KeySpec {
                vkey: 0x27,
                code: "ArrowRight",
                label: "Right",
            },
            KeySpec {
                vkey: 0x28,
                code: "ArrowDown",
                label: "Down",
            },
            KeySpec {
                vkey: 0x10,
                code: "Shift",
                label: "Shift",
            },
            KeySpec {
                vkey: 0x11,
                code: "Control",
                label: "Ctrl",
            },
            KeySpec {
                vkey: 0x12,
                code: "Alt",
                label: "Alt",
            },
        ]
    }
}
