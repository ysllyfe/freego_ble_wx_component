## 使用方法

引入component

```
"usingComponents": {
  "RoomLockCtl": "/components/room-lock-ctl/index",
}
```

```
<RoomLockCtl currentRoom="{{currentRoom}}" bind:blecallback="blueCallback" detachedRelease="{{false}}" bind:httpOpenDoor="httpOpenDoor" />
```

currentRoom 为API返回的数据结构

{id deviceId lockToken version bluetooth: true, httpOnline: false}

## 注意，需要在app.js添加的数据

- 可通过 app.globalData.mobile 调用使用者的手机号
