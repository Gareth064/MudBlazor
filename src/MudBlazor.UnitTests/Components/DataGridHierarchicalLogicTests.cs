// Copyright (c) MudBlazor 2021
// MudBlazor licenses this file to you under the MIT license.
// See the LICENSE file in the project root for more information.

#pragma warning disable BL0005 // Set parameter outside component

using FluentAssertions;
using NUnit.Framework;
using System.Collections.Generic;
using System.Linq;

namespace MudBlazor.UnitTests.Components;

[TestFixture]
public class DataGridHierarchicalLogicTests
{
    public class TestItem
    {
        public string Name { get; set; } = string.Empty;
        public List<TestItem> Children { get; set; } = new();
    }

    [Test]
    public void BuildHierarchicalItems_WithValidHierarchy_ShouldBuildCorrectStructure()
    {
        // Arrange
        var items = new List<TestItem>
        {
            new TestItem
            {
                Name = "Parent1",
                Children = new List<TestItem>
                {
                    new TestItem { Name = "Child1.1", Children = new() },
                    new TestItem { Name = "Child1.2", Children = new() }
                }
            },
            new TestItem { Name = "Parent2", Children = new() },
            new TestItem { Name = "Parent3", Children = new() }
        };

        var dataGrid = new MudDataGrid<TestItem>
        {
            Items = items,
            SelfReferencingHierarchy = true,
            ChildrenSelector = item => item.Children
        };

        // Act - Access CurrentPageItems to trigger hierarchy building
        var result = dataGrid.CurrentPageItems.ToList();

        // Assert
        result.Count.Should().Be(3); // Only root items and no expanded children initially
        result.Should().Contain(i => i.Name == "Parent1");
        result.Should().Contain(i => i.Name == "Parent2");
    }

    [Test]
    public void BuildHierarchicalItems_WithNullChildren_ShouldHandleGracefully()
    {
        // Arrange
        var items = new List<TestItem>
        {
            new TestItem { Name = "Parent1" } // Children list is initialized but empty
        };

        var dataGrid = new MudDataGrid<TestItem>
        {
            Items = items,
            SelfReferencingHierarchy = true,
            ChildrenSelector = item => item.Children
        };

        // Act & Assert - Should not throw
        var result = dataGrid.CurrentPageItems.ToList();
        result.Should().HaveCount(1);
        result[0].Name.Should().Be("Parent1");
    }

    [Test]
    public void GetHierarchicalItem_WithExistingItem_ShouldReturnCorrectWrapper()
    {
        // Arrange
        var testItem = new TestItem { Name = "Test", Children = new() };
        var items = new List<TestItem> { testItem };

        var dataGrid = new MudDataGrid<TestItem>
        {
            Items = items,
            SelfReferencingHierarchy = true,
            ChildrenSelector = item => item.Children
        };

        // Trigger hierarchy building
        _ = dataGrid.CurrentPageItems.ToList();

        // Act
        var hierarchicalItem = dataGrid.GetHierarchicalItem(testItem);

        // Assert
        hierarchicalItem.Should().NotBeNull();
        hierarchicalItem!.Item.Should().Be(testItem);
        hierarchicalItem.Level.Should().Be(0);
        hierarchicalItem.HasChildren.Should().BeFalse();
    }

    [Test]
    public void GetHierarchicalItem_WithNonExistentItem_ShouldReturnNull()
    {
        // Arrange
        var dataGrid = new MudDataGrid<TestItem>
        {
            Items = new List<TestItem>(),
            SelfReferencingHierarchy = true,
            ChildrenSelector = item => item.Children
        };

        var nonExistentItem = new TestItem { Name = "NonExistent" };

        // Act
        var result = dataGrid.GetHierarchicalItem(nonExistentItem);

        // Assert
        result.Should().BeNull();
    }
}
