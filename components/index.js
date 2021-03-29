// components/room-main-info/index.js
import { BlueAdapter } from './blue_adapter.js';
import { BlueV4Adapter } from './blue_v4_adapter.js';
const app = getApp();
// BASE_VOICE_PATH使用根路径，否则无法播放
const BASE_VOICE_PATH = "/components/room-lock-ctl/voices/"
const myaudio = wx.createInnerAudioContext();

const VOICES = {
  "shake": BASE_VOICE_PATH + "shake.mp3", // 摇一摇音效
  "open_success": BASE_VOICE_PATH + "opend.mp3", // 门锁打开提示
  "cannot_open_blue_tooth_adapter": BASE_VOICE_PATH + "blue_adapter_not_open.mp3", //未打开蓝牙
  "cannot_open_blue_tooth_adapter_without_pwd": BASE_VOICE_PATH + "blue_adapter_not_open_without_pwd.mp3", //未打开蓝牙
  "connect_success": BASE_VOICE_PATH + "connect_success.mp3", //蓝牙连接成功
  "open_fail": BASE_VOICE_PATH + "need_force_open.mp3", //需要使用紧急开锁
  "lock_error": BASE_VOICE_PATH + "need_force_open.mp3", //需要使用紧急开锁
  "retry_connect_error": BASE_VOICE_PATH + "connect_time_out.mp3", //连接超时
  "retry_connect_error_without_pwd": BASE_VOICE_PATH + "connect_time_out_without_pwd.mp3", //连接超时不带键盘
}

const VOLUME_KEY = "volume"


function throttle(fn, gapTime) {
  if (gapTime == null || gapTime == undefined) {
    gapTime = 1500
  }

  let _lastTime = null

  // 返回新的函数
  return function () {
    let _nowTime = + new Date()
    if (_nowTime - _lastTime > gapTime || !_lastTime) {
      fn.apply(this, arguments)   //将this和参数传给原函数
      _lastTime = _nowTime
    }
  }
}


Component({

  properties: {
    currentRoom: {
      type: Object,
      value: {}
    },
    detachedRelease: {
      type: Boolean,
      value: true
    }
  },
  data: {
    volume: "1",
    blue_msg: '正在进行安全认证。请稍等',
    percent: 0,
    show_pwd: false,
    show_progress: true,
    current_room_id: 0,
    httpOnline: false,
    showHttpOnline: false
  },

  lifetimes: {
    // 生命周期函数，可以为函数，或一个在methods段中定义的方法名
    attached: function () {
      console.log('生命周期--------attached--------------')
      this.setData({ volume: wx.getStorageSync(VOLUME_KEY) || "1" })
      wx.onAccelerometerChange((r) => {
        this.shakeCallback(r)
      })
    },
    moved: function () {
      console.log('生命周期------------moved------------')
    },
    detached: function () {
      this.data.detachedRelease && app.globalData.blueAdapter && app.globalData.blueAdapter.release()
      myaudio.stop()
      console.log('生命周期------------detached------------')
    },
  },

  pageLifetimes: {
    show: function () {
      wx.onAccelerometerChange((r) => {
        this.shakeCallback(r)
      })
    },
    hide: function () {
      wx.offAccelerometerChange()
    }
  },

  observers: {
    'currentRoom': function (_room) {
      // 使用 setData 设置 this.data.some._room 本身或其下任何子数据字段时触发
      // （除此以外，使用 setData 设置 this.data.some 也会触发）
      // CurrentRoom需要携带的数据
      // hasPasswd deviceId lockToken version
      console.log('ob-----------------')
      console.log(JSON.stringify(_room))
      console.log('ob-----------------')
      this.try_http_open_door = 0
      this.try_http_open_timeout = null
      if (_room.bluetooth) {
        this.time = this.timestamp()
        this.setData({
          httpOnline: _room.httpOnline,
          showHttpOnline: _room.httpOnline
        })
        if (app.globalData.blueAdapter) {
          if (_room.deviceId !== app.globalData.blueAdapter.getParamId()) {
            app.globalData.blueAdapter.release()
            app.globalData.blueAdapter = null
            setTimeout(() => {
              this.initBluetooth(_room)
            }, 100)
          } else if (app.globalData.blueAdapter.connect_ble) {
            this.alreadyConnect()
          } else {
            this.initBluetooth(_room)
          }
        } else {
          myaudio.stop()
          this.initBluetooth(_room)
        }
      }
    },
  },

  externalClasses: ['outside-class', 'no-bottom'],

  /**
   * 组件的方法列表
   */
  methods: {
    chooseHttpOpen: function () {
      this.setData({
        showHttpOnline: true
      })
    },
    chooseBleOpen: function () {
      this.setData({
        showHttpOnline: false
      })
    },
    callback: function () {
      console.log(res)
    },
    shakeCallback: function (e) {
      if (this.data.init_blue && e.x > 0.5 && e.y > 0.5) {
        this.playNotice("shake")
        setTimeout(() => {
          this.open()
        }, 1000)
      }
    },
    alreadyConnect: function () {
      this.setData({
        init_blue: true,
        text: '现在显示蓝牙开锁',
        show_progress: false,
        noPswd: {
          btn: '立即开门',
          title: '手机与门锁已连接成功',
          content: '手机摇一摇也可以打开房门哦'
        }
      })
    },
    // 初始化蓝牙
    initBluetooth: function (_room) {
      this.setData({
        current_room_id: _room.id,
        currentRoomData: _room,
        percent: 0,
        show_pwd: false,
        passwordChars: ['-', ' - ', ' - ', ' - ', ' - ', ' - '],
        init_blue: false,  //是否已实始化蓝牙
        show_progress: true,
        blue_msg: '正在进行安全认证。请稍等'
      })
      if (_room.version == "ble40") {
        app.globalData.blueAdapter = new BlueV4Adapter(_room.deviceId, _room.lockToken, this.blueCallback.bind(this))
      } else {
        app.globalData.blueAdapter = new BlueAdapter(_room.deviceId, _room.version, _room.lockToken, this.blueCallback.bind(this))
      }
      // 需要通过API添加的数据，如果不存在，可以不使用
      var userId = app.globalData.mobile
      var appId = null
      if (wx.getAccountInfoSync) {
        appId = wx.getAccountInfoSync().miniProgram.appId
      }
      app.globalData.blueAdapter.addData({ userid: userId, appid: appId })
      this.getOfflinePassword()
      app.globalData.blueAdapter.connectBluetooth()
    },
    timestamp: function () {
      return Math.round(new Date().getTime() / 1000);
    },
    toggleVolume: function () {
      let volume = this.data.volume == "1" ? "0" : "1"
      if (volume == "0") {
        myaudio.stop();
      }
      this.setData({ volume: volume })
      wx.setStorageSync(VOLUME_KEY, volume)
    },
    toggleOfflinePwd: function () {
      if (this.data.show_pwd == false) {
        this.setData({
          show_pwd: true,
          passwordChars: ['-', ' - ', ' - ', ' - ', ' - ', ' - ']
        })
        this.getOfflinePassword()
      } else {
        this.setData({
          show_pwd: false
        })
      }
    },
    playNotice: function (key) {
      if (this.data.httpOnline == true && this.data.showHttpOnline) {
        return
      }
      console.log("播放音乐-------------", key, this.data.volume)
      if (this.data.volume == "1") {
        myaudio.stop()
        if (key == "cannot_open_blue_tooth_adapter" && !this.data.currentRoom.hasPasswd) {
          key = "cannot_open_blue_tooth_adapter_without_pwd"
        } else if (key == "retry_connect_error" && !this.data.currentRoom.hasPasswd) {
          key = "retry_connect_error_without_pwd"
        }
        myaudio.src = VOICES[key]
        myaudio.play();
      }
    },
    httpOpen: function () {
      // 内部使用
      wx.showLoading({
        title: '开锁中...'
      })
      setTimeout(function () {
        wx.hideLoading()
      }, 2000)
      if (this.try_http_open_timeout) {

      } else {
        this.try_http_open_timeout = setTimeout(() => {
          this.try_http_open_timeout = null
          this.try_http_open_door = 0
        }, 5000)
      }
      var that = this;
      that.try_http_open_door = that.try_http_open_door + 1
      if (that.try_http_open_door > 2) {
        that.setData({
          showHttpOnline: false,
        }, () => {
          if (that.data.init_blue) {
            that.forceOpen()
          }
        })
      } else {
        that.triggerEvent('httpOpenDoor', { room_id: that.data.current_room_id })
      }
    },

    getOfflinePassword: function (mode = 'default') {
      app.globalData.blueAdapter.getOfflinePassword().then(res => {
        this.setData({
          passwordChars: res.password.split("")
        })
        if (mode == "need_modal") {
          wx.showModal({
            title: '蓝牙设备未打开',
            confirmText: '重新连接',
            content: `手机蓝牙未打开，请打开手机蓝牙\n或是使用密码${res.password}开门`,
            success: (res) => {
              if (res.confirm) {
                app.globalData.blueAdapter.reConnect();
              }
            }
          })
        }
      })
    },
    fingerOpen: function () {
      wx.checkIsSupportSoterAuthentication({
        success: (res) => {
          if (res.supportMode.length == 0 || res.supportMode.every(function (x) {
            x != "fingerPrint"
          })) {
            wx.showToast({
              title: "设备不支持指纹识别",
              icon: "none"
            })
          } else {
            wx.startSoterAuthentication({
              requestAuthModes: ['fingerPrint'],
              challenge: '123456',
              authContent: '请用指纹解锁',
              success: (res) => {
                this.open();
              }
            })
          }
        },
        fail: function (e) {
          wx.showToast({
            title: "设备不支持指纹识别",
            icon: "none"
          })
        }
      })
    },
    forceOpenDoor: throttle(() => {
      app.globalData.blueAdapter.forceOpen();
    }),
    open: throttle(() => {
      app.globalData.blueAdapter.openDoor();
    }),
    blueCallback: function (code) {
      console.log('收到回调信息---------------');
      console.log(code);
      this.triggerEvent('blecallback', { code: code })
      switch (code) {
        case "start_bluetooth_devices_discovery":
          this.setData({
            init_blue: false,
            blue_msg: '正在连接门锁...',
            noPswd: {
              btn: '连接中',
              title: '监测到手机蓝牙已打开',
              content: '请等待蓝牙连接'
            }
          })
          break;
        case "found_other_device":
          let percent = this.data.percent + 5
          if (percent > 100) {
            percent = 100
          }
          this.setData({
            percent: percent
          })
          break;
        case "found_device":
          this.setData({
            percent: 100
          })
          break;
        case "start_connect":
          this.setData({
            init_blue: false,
            blue_msg: '开始连接门锁...',
            noPswd: {
              btn: '连接中',
              title: '监测到手机蓝牙已打开',
              content: '请等待蓝牙连接'
            }
          })
          break;
        case "retry_connect_error":
          this.playNotice("retry_connect_error");
          break;
        case 'connect_success':
          this.setData({
            init_blue: true,
            text: '现在显示蓝牙开锁',
            show_progress: false,
            noPswd: {
              btn: '立即开门',
              title: '手机与门锁已连接成功',
              content: '手机摇一摇也可以打开房门哦'
            }
          })
          this.playNotice("connect_success");
          break;
        case 'cannot_open_blue_tooth_adapter':
          this.setData({
            init_blue: false,
            show_progress: false,
            blue_msg: '监测到手机蓝牙未打开，请打开手机蓝牙',
            noPswd: {
              btn: '未打开',
              title: '监测到手机蓝牙未打开',
              content: '请打开手机蓝牙'
            }
          })
          this.playNotice("cannot_open_blue_tooth_adapter")
          if (this.data.currentRoom.hasPasswd) {
            if (this.timestamp() - this.time < 60) {

            } else {
              this.time = this.timestamp()
              this.getOfflinePassword("need_modal")
            }
          }
          break;
        case 'connect_false':
          this.setData({
            init_blue: false,
            blue_msg: '蓝牙已断开，请下拉刷新，重新安全认证',
            show_progress: false,
            noPswd: {
              btn: '已断开',
              title: '蓝牙与门锁连接已断开',
              content: '请下拉刷新，重新连接'
            }
          })
          break;
        case 'not_found_device':
          console.log(this.data.currentRoom);
          if (this.data.currentRoom.hasPasswd && !this.data.showHttpOnline) {
            wx.showToast({
              title: '不在门锁附近或是无法找到设备，请使用密码开门',
              icon: 'none'
            });
          }
          this.playNotice("retry_connect_error");
          this.setData({
            init_blue: false,
            show_progress: false,
            blue_msg: '找寻设备超时，请使用密码开门',
            noPswd: {
              btn: '连接失败',
              title: '找寻设备超时',
              content: '请下拉页面重新连接'
            }
          })
          break;
        case 'open_success':
          wx.showToast({
            title: '门已打开！'
          })
          this.playNotice("open_success");
          break;
        case 'open_fail':
          wx.showToast({
            title: '开门失败~',
            icon: 'none'
          })
          this.playNotice("open_fail");
          break;
        case 'lock_error':
          wx.showToast({
            title: '门锁异常',
            icon: 'none'
          })
          this.playNotice("lock_error");
          break;
        case 'retry_connect':
          wx.hideLoading();
          if (this.data.currentRoom.hasPasswd) {
            // this.getOfflinePassword("need_modal")
            let percent = this.data.percent + 10
            if (percent > 100) {
              percent = 100
            }
            this.setData({
              percent: percent,
              blue_msg: '重试安全认证...'
            })
          } else {
            wx.showModal({
              title: '蓝牙安全认证',
              content: `蓝牙安全认证失败，点击确定深度搜索`,
              success: (res) => {
                if (res.confirm) {
                  app.globalData.blueAdapter.reConnect();
                }
              }
            })
            this.setData({
              show_progress: false,
              noPswd: {
                btn: '连接失败',
                title: '蓝牙安全认证失败',
                content: '点击确定深度搜索'
              }
            })
          }
          break;
        case 'send_command':
          this.data.forceOpen = false;
          break;
        default:
          console.log(code)
      }
    }
  }
})
