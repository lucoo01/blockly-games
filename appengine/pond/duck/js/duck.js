/**
 * Blockly Games: Pond Database
 *
 * Copyright 2014 Google Inc.
 * https://github.com/google/blockly-games
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview Creates a multi-user pond (duck page).
 * @author fraser@google.com (Neil Fraser)
 */
'use strict';

goog.provide('Pond.Duck');

goog.require('Pond');
goog.require('Pond.Duck.soy');
goog.require('Pond.Battle');
goog.require('Pond.Blocks');
goog.require('Pond.Visualization');
goog.require('BlocklyDialogs');
goog.require('BlocklyGames');
goog.require('BlocklyInterface');
goog.require('goog.events');
goog.require('goog.ui.Tab');
goog.require('goog.ui.TabBar');


BlocklyGames.NAME = 'pond-duck';

/**
 * Is the blocks editor the program source (true) or is the JS editor
 * the program source (false).
 * @private
 */
Pond.Duck.blocksEnabled_ = true;

/**
 * ACE editor fires change events even on programatically caused changes.
 * This property is used to signal times when a programatic change is made.
 */
Pond.Duck.ignoreEditorChanges_ = true;

/**
 * Initialize Ace and the pond.  Called on page load.
 */
Pond.Duck.init = function() {
  // Render the Soy template.
  document.body.innerHTML = Pond.Duck.soy.start({}, null,
      {lang: BlocklyGames.LANG,
       html: BlocklyGames.IS_HTML,
       editable: DATA['editable'],
       id: DATA['id'],
       name: DATA['name'],
       description: DATA['description'],
       modified: DATA['modified'],
       player_id: DATA['player_id'],
       player_name: DATA['player_name'],
       level: DATA['level']});

  Pond.init();

  // Setup the tabs.
  Pond.Duck.tabbar = new goog.ui.TabBar();
  Pond.Duck.tabbar.decorate(document.getElementById('tabbar'));

  var rtl = BlocklyGames.isRtl();
  var visualization = document.getElementById('visualization');
  var tabDiv = document.getElementById('tabarea');
  var aboutDiv = document.getElementById('about');
  var blocklyDiv = document.getElementById('blockly');
  var editorDiv = document.getElementById('editor');
  var divs = [aboutDiv, blocklyDiv, editorDiv];
  var onresize = function(e) {
    var top = visualization.offsetTop;
    tabDiv.style.top = (top - window.pageYOffset) + 'px';
    tabDiv.style.left = rtl ? '10px' : '420px';
    tabDiv.style.width = (window.innerWidth - 440) + 'px';
    var divTop =
        Math.max(0, top + tabDiv.offsetHeight - window.pageYOffset) + 'px';
    var divLeft = rtl ? '10px' : '420px';
    var divWidth = (window.innerWidth - 440) + 'px';
    for (var i = 0, div; div = divs[i]; i++) {
      div.style.top = divTop;
      div.style.left = divLeft;
      div.style.width = divWidth;
    }
  };
  window.addEventListener('scroll', function() {
      onresize();
      Blockly.fireUiEvent(window, 'resize');
    });
  window.addEventListener('resize', onresize);
  onresize();

  // Handle SELECT events dispatched by tabs.
  goog.events.listen(Pond.Duck.tabbar, goog.ui.Component.EventType.SELECT,
      function(e) {
        var index = e.target.getParent().getSelectedTabIndex();
        Pond.Duck.changeTab(index);
      });

  if (DATA['javascript'] && !DATA['xml']) {
    Pond.Duck.blocksEnabled_ = false;
    Pond.Duck.tabbar.getChildAt(1).setEnabled(false);
  }

  // Inject JS editor.
  var defaultCode = DATA['javascript'] ||'cannon(0, 70);';
  BlocklyInterface.editor = window['ace']['edit']('editor');
  BlocklyInterface.editor['setTheme']('ace/theme/chrome');
  BlocklyInterface.editor['setShowPrintMargin'](false);
  var session = BlocklyInterface.editor['getSession']();
  session['setMode']('ace/mode/javascript');
  session['setTabSize'](2);
  session['setUseSoftTabs'](true);
  session['on']('change', Pond.Duck.editorChanged);
  BlocklyInterface.editor['setValue'](defaultCode, -1);

  // Inject Blockly.
  var toolbox = document.getElementById('toolbox');
  BlocklyGames.workspace = Blockly.inject('blockly',
      {'media': 'media/',
       'rtl': false,
       'toolbox': toolbox,
       'trashcan': true});
  Blockly.JavaScript.addReservedWords('scan,cannon,drive,swim,stop,speed,' +
      'damage,health,loc_x,loc_y');
  var defaultXml = DATA['xml'] ||
      '<xml>' +
      '  <block type="pond_cannon" x="70" y="70">' +
      '    <value name="DEGREE">' +
      '      <block type="pond_math_number">' +
      '        <field name="NUM">0</field>' +
      '      </block>' +
      '    </value>' +
      '    <value name="RANGE">' +
      '      <block type="pond_math_number">' +
      '        <field name="NUM">70</field>' +
      '      </block>' +
      '    </value>' +
      '  </block>' +
      '</xml>';
  var xml = Blockly.Xml.textToDom(defaultXml);
  // Clear the workspace to avoid merge.
  BlocklyGames.workspace.clear();
  Blockly.Xml.domToWorkspace(BlocklyGames.workspace, xml);

  var players = [
    {
      start: new goog.math.Coordinate(20, 80),
      damage: 0,
      name: 'Pond_myName',
      code: null
    },
    {
      start: new goog.math.Coordinate(80, 20),
      damage: 0,
      name: 'Pond_rookName',
      code: 'playerRook'
    },
    {
      start: new goog.math.Coordinate(20, 20),
      damage: 0,
      name: 'Pond_counterName',
      code: 'playerCounter'
    },
    {
      start: new goog.math.Coordinate(80, 80),
      damage: 0,
      name: 'Pond_sniperName',
      code: 'playerSniper'
    }
  ];

  for (var playerData, i = 0; playerData = players[i]; i++) {
    if (playerData.code) {
      var div = document.getElementById(playerData.code);
      var code = div.textContent;
    } else {
      var code = function() {
        if (Pond.Duck.blocksEnabled_) {
          return Blockly.JavaScript.workspaceToCode(BlocklyGames.workspace);
        } else {
          return BlocklyInterface.editor['getValue']();
        }
      };
    }
    var name = BlocklyGames.getMsg(playerData.name);
    Pond.Battle.addAvatar(name, code, playerData.start, playerData.damage);
  }
  Pond.reset();
  Pond.Duck.changeTab(0);
  Pond.Duck.ignoreEditorChanges_ = false;
};

/**
 * Called by the tab bar when a tab is selected.
 * @param {number} index Which tab is now active (0-2).
 */
Pond.Duck.changeTab = function(index) {
  var ABOUT = 0;
  var BLOCKS = 1;
  var JAVASCRIPT = 2;
  // Show the correct tab contents.
  var aboutDiv = document.getElementById('about');
  var blocklyDiv = document.getElementById('blockly');
  var editorDiv = document.getElementById('editor');
  var divs = [aboutDiv, blocklyDiv, editorDiv];
  for (var i = 0, div; div = divs[i]; i++) {
    div.style.visibility = (i == index) ? 'visible' : 'hidden';
  }
  // Synchronize the documentation popup.
  document.getElementById('docsButton').disabled = (index == ABOUT);
  if (index == ABOUT) {
    Pond.docsCloseClick();
  } else {
    BlocklyGames.LEVEL = (index == BLOCKS) ? 11 : 12;
    if (Pond.isDocsVisible_) {
      var frame = document.getElementById('frameDocs');
      frame.src = 'pond/docs.html?lang=' + BlocklyGames.LANG +
          '&mode=' + BlocklyGames.LEVEL;
    }
  }
  // Synchronize the JS editor.
  if (index == JAVASCRIPT && Pond.Duck.blocksEnabled_) {
    var code = Blockly.JavaScript.workspaceToCode(BlocklyGames.workspace);
    Pond.Duck.ignoreEditorChanges_ = true;
    BlocklyInterface.editor['setValue'](code, -1);
    Pond.Duck.ignoreEditorChanges_ = false;
  }
};

/**
 * Change event for JS editor.  Warn the user, then disconnect the link from
 * blocks to JavaScript.
 */
Pond.Duck.editorChanged = function() {
  if (Pond.Duck.ignoreEditorChanges_) {
    return;
  }
  if (Pond.Duck.blocksEnabled_) {
    if (!BlocklyGames.workspace.getTopBlocks(false).length ||
        confirm(BlocklyGames.getMsg('Pond_breakLink'))) {
      // Break link betweeen blocks and JS.
      Pond.Duck.tabbar.getChildAt(1).setEnabled(false);
      Pond.Duck.blocksEnabled_ = false;
    } else {
      // Abort change, preserve link.
      var code = Blockly.JavaScript.workspaceToCode(BlocklyGames.workspace);
      Pond.Duck.ignoreEditorChanges_ = true;
      BlocklyInterface.editor['setValue'](code, -1);
      Pond.Duck.ignoreEditorChanges_ = false;
    }
  } else {
    var code = BlocklyInterface.editor['getValue']();
    if (!code.trim()) {
      // Reestablish link between blocks and JS.
      BlocklyGames.workspace.clear();
      Pond.Duck.tabbar.getChildAt(1).setEnabled(true);
      Pond.Duck.blocksEnabled_ = true;
    }
  }
};

window.addEventListener('load', Pond.Duck.init);
