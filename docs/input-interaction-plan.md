# 输入联动桌宠计划

## 目标

把桌宠从“按状态播放动画”升级为“跟随用户键鼠输入做工位互动”：

- 桌宠旁固定显示电脑、键盘、鼠标。
- 用户敲键盘时进入 `typing`，并高亮对应键位。
- 用户移动鼠标时进入 `mousing`，并高亮鼠标。
- 停止输入后先短暂保持 `working`，再回到 `idle` 摸鱼状态。
- 手动模式不被自动输入识别覆盖。
- 设置页提供键鼠联动开关，关闭后后端不再发送键鼠活动事件。

## 执行顺序

1. 扩展资源格式，让现有 spritesheet 之外可以描述工位布局。
2. Canvas 支持更大的 stage，并在角色动画前后绘制电脑、键盘、鼠标覆盖层。
3. 增加 `typing` / `mousing` 状态，先复用现有工作帧。
4. 后端识别全局键盘按下和鼠标移动，向前端发送轻量输入事件。
5. 自动模式根据最近输入事件切换 `typing` / `mousing` / `working` / `idle`。
6. 设置页提供键鼠联动总开关，并持久化到配置。
7. 后续再替换精细美术资源，把“高亮键位”升级为“角色手部精确落点”。

## 资源格式扩展

旧格式继续兼容。新增字段为可选字段：

```json
{
  "stage": {
    "width": 286,
    "height": 246
  },
  "sprite": {
    "x": 0,
    "y": 38,
    "width": 192,
    "height": 208
  },
  "animations": {
    "typing": {
      "frames": [56, 57, 58, 59],
      "fps": 10,
      "loop": true
    },
    "mousing": {
      "frames": [56, 57, 58, 59],
      "fps": 7,
      "loop": true
    }
  },
  "workstation": {
    "monitor": {
      "x": 184,
      "y": 48,
      "width": 76,
      "height": 58
    },
    "keyboard": {
      "x": 104,
      "y": 176,
      "width": 154,
      "height": 64,
      "rows": []
    },
    "mouse": {
      "x": 264,
      "y": 190,
      "width": 20,
      "height": 30
    }
  }
}
```

字段说明：

- `stage`：最终 Canvas 舞台尺寸。没有该字段时继续使用 `frame.width` / `frame.height`。
- `sprite`：角色 spritesheet 当前帧绘制到 stage 上的位置。没有该字段时继续铺满原始帧尺寸。
- `workstation.monitor`：电脑屏幕区域。
- `workstation.keyboard`：键盘整体区域和键位布局。
- `workstation.keyboard.rows[].keys[]`：具体键位，`id` 对应输入事件 code，`aliases` 用于兼容简写。
- `workstation.mouse`：鼠标区域。

## 当前第一版限制

- 当前键盘和鼠标是 Canvas 覆盖层，不是最终像素美术。
- `typing` / `mousing` 暂时复用现有工作动画帧。
- 键盘反馈以高亮键位为主，还没有精确到角色手指落点。
- Windows 下已接入键鼠轮询；其他平台后续需要补对应系统实现。
- 浏览器预览环境没有全局键鼠能力，只用页面自身 `keydown` / `mousemove` 事件模拟调试。

## 验收标准

- `koda` 和 `lumen` 都能显示固定电脑、键盘、鼠标。
- 敲字母、数字、空格、回车、方向键等常见按键时，对应键位短暂高亮。
- 移动鼠标时，鼠标区域短暂高亮。
- 自动模式下，最近键盘输入显示 `typing`，最近鼠标移动显示 `mousing`。
- 输入停止约 5 秒后回到 `idle`。
- 手动模式下，键鼠输入不覆盖用户选择的状态。
- 关闭键鼠联动后，桌宠不响应键鼠活动事件。
