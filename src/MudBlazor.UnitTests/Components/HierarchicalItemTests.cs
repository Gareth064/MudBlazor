// Copyright (c) MudBlazor 2021
// MudBlazor licenses this file to you under the MIT license.
// See the LICENSE file in the project root for more information.

using FluentAssertions;
using NUnit.Framework;

namespace MudBlazor.UnitTests.Components
{
    [TestFixture]
    public class HierarchicalItemTests
    {
        [Test]
        public void HierarchicalItem_GetIndentationStyle_ShouldReturnCorrectPadding()
        {
            // Arrange
            var item = new HierarchicalItem<string>
            {
                Item = "test",
                Level = 0,
                Parent = null,
                HasChildren = false,
                IsExpanded = false
            };

            // Act & Assert
            item.GetIndentationStyle(24).Should().Be("", "Level 0 should have no indentation");

            // Level 1
            item = item with { Level = 1 };
            item.GetIndentationStyle(24).Should().Be("padding-left: 24px;");

            // Level 2
            item = item with { Level = 2 };
            item.GetIndentationStyle(24).Should().Be("padding-left: 48px;");

            // Custom indentation size
            item = item with { Level = 1 };
            item.GetIndentationStyle(16).Should().Be("padding-left: 16px;");
        }

        [Test]
        public void HierarchicalItem_Properties_ShouldBeSetCorrectly()
        {
            // Arrange
            var parent = new HierarchicalItem<string>
            {
                Item = "parent",
                Level = 0,
                Parent = null,
                HasChildren = true,
                IsExpanded = true
            };

            var child = new HierarchicalItem<string>
            {
                Item = "child",
                Level = 1,
                Parent = parent,
                HasChildren = false,
                IsExpanded = false
            };

            // Assert
            child.Item.Should().Be("child");
            child.Level.Should().Be(1);
            child.Parent.Should().Be(parent);
            child.HasChildren.Should().BeFalse();
            child.IsExpanded.Should().BeFalse();
        }
    }
}